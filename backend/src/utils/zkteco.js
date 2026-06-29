/**
 * zkteco.js
 * 
 * Connects to a ZKTeco UFace 800 (or similar) biometric device over TCP,
 * downloads all punch records, and upserts them into the HRIS attendance table.
 *
 * Protocol: ZKTeco proprietary binary protocol via node-zklib.
 *
 * Device user IDs are expected to match HRIS employee_code values (e.g. "EMP001").
 * If they are numeric-only IDs, they are zero-padded and matched against employee_code.
 *
 * Usage:
 *   const { syncZKTeco } = require('./zkteco');
 *   const result = await syncZKTeco();
 */

const ZKLib = require('node-zklib');
const db = require('../db');
const { sendMail } = require('./mailer');

const DEVICE_IP   = process.env.ZKTECO_IP   || null;
const DEVICE_PORT = Number(process.env.ZKTECO_PORT) || 4370;
const TIMEOUT     = 5000; // ms to wait for device connection

// Office start time for late detection (e.g. "09:30")
const OFFICE_START = process.env.OFFICE_START_TIME || '09:30';

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Converts a JS Date to local date string "YYYY-MM-DD"
 */
function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Converts a JS Date to local time string "HH:MM:SS"
 */
function timeStr(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Build a map of device user ID → employee DB row.
 * ZKTeco stores users with a userId field (usually "1", "2" etc.).
 * We match that against employee_code (e.g. "EMP001") or the numeric suffix.
 */
function buildEmployeeMap() {
  const employees = db.prepare(`
    SELECT id, employee_code, full_name, shift_start FROM employees WHERE employment_status = 'active'
  `).all();

  const map = {};
  for (const emp of employees) {
    // Direct match: device userId === employee_code
    map[emp.employee_code] = emp;

    // Numeric suffix match: device stores "1" → "EMP001"
    const numericSuffix = emp.employee_code.replace(/\D/g, '');
    if (numericSuffix) {
      map[numericSuffix] = emp;
      map[String(Number(numericSuffix))] = emp; // remove leading zeros
    }
  }
  return map;
}

/**
 * Main sync function. Pulls attendance records from the device and upserts
 * them into the HRIS attendance table.
 *
 * @returns {{ synced: number, skipped: number, errors: string[] }}
 */
async function syncZKTeco() {
  if (!DEVICE_IP) {
    return { synced: 0, skipped: 0, errors: ['ZKTECO_IP is not set in environment variables.'] };
  }

  const errors = [];
  let synced = 0;
  let skipped = 0;

  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, TIMEOUT, 0);

  try {
    await zk.createSocket();
    console.log(`[ZKTeco] Connected to device at ${DEVICE_IP}:${DEVICE_PORT}`);

    // Download attendance logs from device
    const { data: attendanceLogs } = await zk.getAttendances();
    console.log(`[ZKTeco] Downloaded ${attendanceLogs.length} punch records from device.`);

    const employeeMap = buildEmployeeMap();

    // Group punches by (employeeId, date) to find first (check-in) and last (check-out)
    const dayMap = {}; // key: `${employeeId}_${date}` → { emp, date, punches[] }

    for (const log of attendanceLogs) {
      const deviceUserId = String(log.deviceUserId).trim();
      const emp = employeeMap[deviceUserId];

      if (!emp) {
        skipped++;
        continue;
      }

      const punchTime = new Date(log.recordTime);
      const date = dateStr(punchTime);
      const key = `${emp.id}_${date}`;

      if (!dayMap[key]) {
        dayMap[key] = { emp, date, punches: [] };
      }
      dayMap[key].punches.push(punchTime);
    }

    // Upsert attendance rows
    const upsert = db.prepare(`
      INSERT INTO attendance (employee_id, date, status, check_in, check_out, late)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        check_in  = COALESCE(excluded.check_in,  check_in),
        check_out = COALESCE(excluded.check_out, check_out),
        status    = excluded.status,
        late      = excluded.late
    `);

    const tx = db.transaction(() => {
      for (const entry of Object.values(dayMap)) {
        const { emp, date, punches } = entry;

        punches.sort((a, b) => a - b);
        const first = punches[0];
        const last  = punches.length > 1 ? punches[punches.length - 1] : null;

        const checkIn  = timeStr(first);
        const checkOut = last ? timeStr(last) : null;

        // Determine late status
        const officeStart = emp.shift_start || OFFICE_START;
        const startMin = timeToMinutes(officeStart);
        const checkMin = timeToMinutes(checkIn.slice(0, 5));

        let diff = checkMin - startMin;
        if (diff < -720) {
          diff += 1440;
        } else if (diff > 720) {
          diff -= 1440;
        }

        // 15-minute grace period rule: marked late only if checked in after shift_start + 15 min.
        const isLate = diff > 15 ? 1 : 0;

        // Determine half-day: worked < 4 hours
        let status = 'present';
        if (checkOut) {
          const workedMins = (last - first) / 60000;
          if (workedMins < 240) status = 'half_day';
        }

        upsert.run(emp.id, date, status, checkIn, checkOut, isLate);
        synced++;

        // Send late notification if needed
        if (isLate) {
          try {
            const row = db.prepare(`SELECT late_notified FROM attendance WHERE employee_id = ? AND date = ?`).get(emp.id, date);
            if (row && !row.late_notified) {
              const empUser = db.prepare(`SELECT u.email FROM users u JOIN employees e ON e.user_id = u.id WHERE e.id = ?`).get(emp.id);
              if (empUser && empUser.email) {
                sendMail({
                  to: empUser.email,
                  subject: `Late Check-In Recorded — ${date}`,
                  text: `Dear ${emp.full_name},\n\nYour check-in time of ${checkIn} on ${date} is recorded as late (office starts at ${OFFICE_START}).\n\nBest regards,\nBrandigade HR Team`,
                });
              }
              const adminEmail = process.env.ADMIN_EMAIL;
              if (adminEmail) {
                sendMail({
                  to: adminEmail,
                  subject: `Late Arrival: ${emp.full_name} — ${date}`,
                  text: `${emp.full_name} checked in at ${checkIn} on ${date} (office starts at ${OFFICE_START}).`,
                });
              }
              db.prepare(`UPDATE attendance SET late_notified = 1 WHERE employee_id = ? AND date = ?`).run(emp.id, date);
            }
          } catch (e) {
            errors.push(`Late email for ${emp.full_name} on ${date}: ${e.message}`);
          }
        }
      }
    });

    tx();
    console.log(`[ZKTeco] Sync complete. Synced: ${synced}, Skipped (unmapped): ${skipped}`);

  } catch (err) {
    const msg = `[ZKTeco] Sync failed: ${err.message}`;
    console.error(msg);
    errors.push(msg);
  } finally {
    try { await zk.disconnect(); } catch (_) {}
  }

  return { synced, skipped, errors };
}

module.exports = { syncZKTeco };
