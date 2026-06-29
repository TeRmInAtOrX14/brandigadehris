const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

// ─── HELPERS ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr() {
  // Returns HH:MM:SS in local-style (server clock)
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

// Parse "HH:MM" or "HH:MM:SS" into total minutes from midnight
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ─── EMPLOYEE CHECK-IN ──────────────────────────────────────────────────────

router.post('/checkin', requireAuth, (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return res.status(400).json({ error: 'No employee profile linked to this account.' });

  const date = todayStr();
  const checkInTime = nowTimeStr();

  // Fetch employee custom shift timing
  const emp = db.prepare(`SELECT shift_start FROM employees WHERE id = ?`).get(employeeId);
  const officeStart = (emp && emp.shift_start) || process.env.OFFICE_START_TIME || '09:30';

  const startMin = timeToMinutes(officeStart);
  const checkMin = timeToMinutes(checkInTime);

  // Robust difference calculation with midnight wrap-around support for night shifts
  let diff = checkMin - startMin;
  if (diff < -720) {
    diff += 1440;
  } else if (diff > 720) {
    diff -= 1440;
  }

  // 15-minute grace period rule: marked late only if checked in after shift_start + 15 min.
  const isLate = diff > 15 ? 1 : 0;

  // Upsert attendance record for today
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, check_in, late)
    VALUES (?, ?, 'present', ?, ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET
      check_in = CASE WHEN check_in IS NULL THEN excluded.check_in ELSE check_in END,
      status = CASE WHEN status IN ('holiday','weekend','leave') THEN status ELSE 'present' END,
      late = excluded.late
  `).run(employeeId, date, checkInTime, isLate);

  // Send late notification email (once per day)
  if (isLate) {
    try {
      const row = db.prepare(`SELECT late_notified FROM attendance WHERE employee_id = ? AND date = ?`).get(employeeId, date);
      if (row && !row.late_notified) {
        const empInfo = db.prepare(`
          SELECT e.full_name, u.email FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ?
        `).get(employeeId);
        if (empInfo) {
          sendMail({
            to: empInfo.email,
            subject: `Late Check-In Recorded — ${date}`,
            text: `Dear ${empInfo.full_name},\n\nThis is an automated notice that your check-in time of ${checkInTime} on ${date} is after the office start time of ${officeStart}.\n\nIf this is incorrect, please contact your HR administrator.\n\nBest regards,\nBrandigade HR Team`,
          });
          // Also notify admin
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail) {
            sendMail({
              to: adminEmail,
              subject: `Late Arrival: ${empInfo.full_name} — ${date}`,
              text: `${empInfo.full_name} checked in late at ${checkInTime} on ${date} (office starts at ${officeStart}).`,
            });
          }
        }
        db.prepare(`UPDATE attendance SET late_notified = 1 WHERE employee_id = ? AND date = ?`).run(employeeId, date);
      }
    } catch (err) {
      console.error('[Attendance] Late notification error:', err);
    }
  }

  res.json({ ok: true, date, checkIn: checkInTime, late: !!isLate });
});

// ─── EMPLOYEE CHECK-OUT ─────────────────────────────────────────────────────

router.post('/checkout', requireAuth, (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return res.status(400).json({ error: 'No employee profile linked to this account.' });

  const date = todayStr();
  const checkOutTime = nowTimeStr();

  const row = db.prepare(`SELECT * FROM attendance WHERE employee_id = ? AND date = ?`).get(employeeId, date);
  if (!row || !row.check_in) {
    return res.status(400).json({ error: 'No check-in found for today. Please check in first.' });
  }
  if (row.check_out) {
    return res.status(409).json({ error: 'Already checked out for today.' });
  }

  // Determine half-day: less than 4 hours (240 minutes) of work
  const workedMinutes = timeToMinutes(checkOutTime) - timeToMinutes(row.check_in);
  const isHalfDay = workedMinutes < 240;

  db.prepare(`
    UPDATE attendance SET check_out = ?, status = ? WHERE employee_id = ? AND date = ?
  `).run(checkOutTime, isHalfDay ? 'half_day' : 'present', employeeId, date);

  res.json({ ok: true, date, checkOut: checkOutTime, workedMinutes, halfDay: isHalfDay });
});

// ─── EMPLOYEE: TODAY'S STATUS ────────────────────────────────────────────────

router.get('/today', requireAuth, (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return res.status(400).json({ error: 'No employee profile linked.' });

  const date = todayStr();
  const row = db.prepare(`SELECT * FROM attendance WHERE employee_id = ? AND date = ?`).get(employeeId, date);
  res.json(row || { employee_id: employeeId, date, status: null, check_in: null, check_out: null, late: 0 });
});

// ─── ADMIN: MARK ATTENDANCE (single, with check-in/out support) ──────────────

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { employeeId, date, status, note, checkIn, checkOut } = req.body || {};
  if (!employeeId || !date || !status) {
    return res.status(400).json({ error: 'employeeId, date and status are required.' });
  }
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, note, check_in, check_out)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      check_in = COALESCE(excluded.check_in, check_in),
      check_out = COALESCE(excluded.check_out, check_out)
  `).run(employeeId, date, status, note || null, checkIn || null, checkOut || null);
  res.json({ ok: true });
});

// ─── ADMIN: BULK MARK ────────────────────────────────────────────────────────

router.post('/bulk', requireAuth, requireAdmin, (req, res) => {
  const { date, defaultStatus, exceptions } = req.body || {};
  if (!date || !defaultStatus) {
    return res.status(400).json({ error: 'date and defaultStatus are required.' });
  }
  const employees = db.prepare(`SELECT id FROM employees WHERE employment_status = 'active'`).all();
  const upsert = db.prepare(`
    INSERT INTO attendance (employee_id, date, status, note) VALUES (?, ?, ?, ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, note = excluded.note
  `);
  const exceptionMap = {};
  (exceptions || []).forEach(e => { exceptionMap[e.employeeId] = e; });

  const tx = db.transaction(() => {
    for (const emp of employees) {
      const ex = exceptionMap[emp.id];
      upsert.run(emp.id, date, ex ? ex.status : defaultStatus, ex ? ex.note || null : null);
    }
  });
  tx();

  res.json({ ok: true, employeesMarked: employees.length });
});

// ─── GET ATTENDANCE FOR AN EMPLOYEE ─────────────────────────────────────────

router.get('/:employeeId', requireAuth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (req.user.role !== 'admin' && req.user.employeeId !== employeeId) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db.prepare(`
      SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date
    `).all(employeeId, from, to);
  } else {
    rows = db.prepare(`SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 60`).all(employeeId);
  }
  res.json(rows);
});

// ─── ADMIN: DAILY SUMMARY (lates + absences) ─────────────────────────────────

router.get('/summary/daily', requireAuth, requireAdmin, (req, res) => {
  const date = req.query.date || todayStr();
  const rows = db.prepare(`
    SELECT
      a.*,
      e.full_name,
      e.employee_code,
      e.designation,
      e.department
    FROM attendance a
    JOIN employees e ON e.id = a.employee_id
    WHERE a.date = ?
    ORDER BY e.full_name
  `).all(date);
  res.json(rows);
});

module.exports = router;
