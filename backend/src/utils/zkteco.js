const ZKLib = require('node-zklib');
const { PrismaClient } = require('@prisma/client');
const { sendMail } = require('./mailer');

const prisma = new PrismaClient();

const DEVICE_IP = process.env.ZKTECO_IP || null;
const DEVICE_PORT = Number(process.env.ZKTECO_PORT) || 4370;
const TIMEOUT = 5000; // ms to wait for device connection

// Office start time for late detection (e.g. "09:30")
const OFFICE_START = process.env.OFFICE_START_TIME || '09:30';
const OFFICE_END = process.env.OFFICE_END_TIME || '18:30';

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Normalizes device record date into UTC-based Date object representing the midnight of local date
 */
function getLocalDateMidnight(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Main sync function. Pulls attendance records from the device and upserts
 * them into the database using Prisma.
 *
 * @returns {Promise<{ synced: number, skipped: number, errors: string[] }>}
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

    // 1. Fetch active employees to map device user IDs
    const employees = await prisma.employee.findMany({
      where: { status: 'active' },
      include: { user: true }
    });

    const employeeMap = {};
    for (const emp of employees) {
      // Direct match
      employeeMap[emp.employeeCode] = emp;
      if (emp.zkUserId) {
        employeeMap[emp.zkUserId] = emp;
      }
      // Numeric suffix matching (e.g., EMP-003 or EMP003 -> 3)
      const numericSuffix = emp.employeeCode.replace(/\D/g, '');
      if (numericSuffix) {
        employeeMap[numericSuffix] = emp;
        employeeMap[String(Number(numericSuffix))] = emp;
      }
    }

    // 2. Group punches by (employeeId, date)
    const dayMap = {}; // key: `${employeeId}_${dateString}`

    for (const log of attendanceLogs) {
      const deviceUserId = String(log.deviceUserId).trim();
      const emp = employeeMap[deviceUserId];

      if (!emp) {
        skipped++;
        continue;
      }

      const punchTime = new Date(log.recordTime);
      const dateMidnight = getLocalDateMidnight(punchTime);
      const dateKey = dateMidnight.toISOString().split('T')[0];
      const key = `${emp.id}_${dateKey}`;

      if (!dayMap[key]) {
        dayMap[key] = { emp, dateMidnight, punches: [] };
      }
      dayMap[key].punches.push(punchTime);
    }

    // 3. Upsert attendance records
    for (const entry of Object.values(dayMap)) {
      const { emp, dateMidnight, punches } = entry;

      punches.sort((a, b) => a.getTime() - b.getTime());
      const checkInTime = punches[0];
      const checkOutTime = punches.length > 1 ? punches[punches.length - 1] : null;

      // Extract hours and minutes for calculation
      const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
      const shiftStartMinutes = timeToMinutes(emp.shiftStart || OFFICE_START);

      // Grace period calculation (15 minutes grace)
      const diffMinutes = checkInMinutes - shiftStartMinutes;
      const lateMins = diffMinutes > 15 ? diffMinutes : 0;

      // Early departure calculation
      let earlyDepartureMins = 0;
      let overtimeMins = 0;
      const shiftEndMinutes = timeToMinutes(emp.shiftEnd || OFFICE_END);

      if (checkOutTime) {
        const checkOutMinutes = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
        if (checkOutMinutes < shiftEndMinutes) {
          earlyDepartureMins = shiftEndMinutes - checkOutMinutes;
        } else {
          overtimeMins = checkOutMinutes - shiftEndMinutes;
        }
      }

      // Check-in and out worked minutes check for half-day status
      let status = 'present';
      if (checkOutTime) {
        const workedMins = (checkOutTime.getTime() - checkInTime.getTime()) / 60000;
        if (workedMins < 240) {
          status = 'half_day';
        }
      }

      // Check if a record already exists
      const existingAttendance = await prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: emp.id,
            date: dateMidnight
          }
        }
      });

      // Upsert record
      await prisma.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId: emp.id,
            date: dateMidnight
          }
        },
        create: {
          employeeId: emp.id,
          date: dateMidnight,
          status,
          checkIn: checkInTime,
          checkOut: checkOutTime,
          late: lateMins,
          earlyDeparture: earlyDepartureMins,
          overtime: overtimeMins,
          zkSyncId: 'zk_sync_log'
        },
        update: {
          checkIn: existingAttendance?.checkIn || checkInTime,
          checkOut: checkOutTime || existingAttendance?.checkOut,
          status: status,
          late: lateMins,
          earlyDeparture: earlyDepartureMins,
          overtime: overtimeMins
        }
      });

      synced++;

      // Trigger Email Notification for Late Arrival if this is the first time registering the late entry
      if (lateMins > 0 && (!existingAttendance || existingAttendance.late === 0)) {
        try {
          if (emp.user && emp.user.email) {
            const timeStr = checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            await sendMail({
              to: emp.user.email,
              subject: `Late Check-In Recorded — ${dateMidnight.toISOString().split('T')[0]}`,
              text: `Dear ${emp.fullName},\n\nYour check-in time of ${timeStr} on ${dateMidnight.toISOString().split('T')[0]} is recorded as late (${lateMins} minutes past shift start).\n\nBest regards,\nBrandigade HR Team`,
            });
          }
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail) {
            const timeStr = checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            await sendMail({
              to: adminEmail,
              subject: `Late Arrival: ${emp.fullName} — ${dateMidnight.toISOString().split('T')[0]}`,
              text: `${emp.fullName} checked in at ${timeStr} (${lateMins} minutes late).`,
            });
          }
        } catch (e) {
          errors.push(`Late email failed for ${emp.fullName}: ${e.message}`);
        }
      }
    }

    console.log(`[ZKTeco] Sync complete. Synced: ${synced}, Skipped: ${skipped}`);
  } catch (err) {
    const msg = `[ZKTeco] Sync failed: ${err.message}`;
    console.error(msg);
    errors.push(msg);
  } finally {
    try {
      await zk.disconnect();
    } catch (_) {}
  }

  return { synced, skipped, errors };
}

module.exports = { syncZKTeco };
