const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

function currentYear() {
  return new Date().getFullYear();
}

function ensureBalance(employeeId, leaveTypeId, year) {
  const existing = db.prepare(`
    SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
  `).get(employeeId, leaveTypeId, year);
  if (existing) return existing;

  const leaveType = db.prepare(`SELECT * FROM leave_types WHERE id = ?`).get(leaveTypeId);
  db.prepare(`
    INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated, used)
    VALUES (?, ?, ?, ?, 0)
  `).run(employeeId, leaveTypeId, year, leaveType ? leaveType.annual_allowance : 0);

  return db.prepare(`
    SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
  `).get(employeeId, leaveTypeId, year);
}

router.get('/types', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT * FROM leave_types ORDER BY id`).all());
});

router.post('/types', requireAuth, requireAdmin, (req, res) => {
  const { name, annualAllowance } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  db.prepare(`INSERT INTO leave_types (name, annual_allowance) VALUES (?, ?)`)
    .run(name, Number(annualAllowance) || 0);
  res.status(201).json({ ok: true });
});

// Get balances for an employee (self or admin)
router.get('/balances/:employeeId', requireAuth, (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (req.user.role !== 'admin' && req.user.employeeId !== employeeId) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  const year = Number(req.query.year) || currentYear();
  const leaveTypes = db.prepare(`SELECT * FROM leave_types`).all();
  const balances = leaveTypes.map(lt => {
    const bal = ensureBalance(employeeId, lt.id, year);
    return {
      leaveTypeId: lt.id,
      leaveTypeName: lt.name,
      allocated: bal.allocated,
      used: bal.used,
      remaining: bal.allocated - bal.used,
    };
  });
  res.json(balances);
});

// Submit a leave request
router.post('/requests', requireAuth, (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) return res.status(400).json({ error: 'No employee profile linked to this account.' });

  const { leaveTypeId, startDate, endDate, reason } = req.body || {};
  if (!leaveTypeId || !startDate || !endDate) {
    return res.status(400).json({ error: 'leaveTypeId, startDate and endDate are required.' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return res.status(400).json({ error: 'Invalid date range.' });
  }
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const result = db.prepare(`
    INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(employeeId, leaveTypeId, startDate, endDate, days, reason || null);

  // Send automated email alert to admin
  try {
    const empInfo = db.prepare(`
      SELECT e.full_name, u.email 
      FROM employees e 
      JOIN users u ON u.id = e.user_id 
      WHERE e.id = ?
    `).get(employeeId);
    
    const ltInfo = db.prepare(`SELECT name FROM leave_types WHERE id = ?`).get(leaveTypeId);
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@brandigade.com';
    
    if (empInfo) {
      sendMail({
        to: adminEmail,
        subject: `New Leave Request: ${empInfo.full_name}`,
        text: `Employee ${empInfo.full_name} (${empInfo.email}) has requested ${days} day(s) of ${ltInfo ? ltInfo.name : 'Leave'}.\n\nPeriod: ${startDate} to ${endDate}\nReason: ${reason || 'Not specified'}\n\nPlease review this request in the Brandigade HRIS Admin Panel.`
      });
    }
  } catch (err) {
    console.error('Error sending leave request email alert:', err);
  }

  res.status(201).json({ id: result.lastInsertRowid, days, status: 'pending' });
});

// List requests (admin sees all/pending, employee sees own)
router.get('/requests', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    const status = req.query.status;
    const rows = status
      ? db.prepare(`
          SELECT lr.*, e.full_name, lt.name AS leave_type_name
          FROM leave_requests lr
          JOIN employees e ON e.id = lr.employee_id
          JOIN leave_types lt ON lt.id = lr.leave_type_id
          WHERE lr.status = ?
          ORDER BY lr.created_at DESC
        `).all(status)
      : db.prepare(`
          SELECT lr.*, e.full_name, lt.name AS leave_type_name
          FROM leave_requests lr
          JOIN employees e ON e.id = lr.employee_id
          JOIN leave_types lt ON lt.id = lr.leave_type_id
          ORDER BY lr.created_at DESC
        `).all();
    return res.json(rows);
  }

  const rows = db.prepare(`
    SELECT lr.*, lt.name AS leave_type_name
    FROM leave_requests lr
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ?
    ORDER BY lr.created_at DESC
  `).all(req.user.employeeId);
  res.json(rows);
});

// Approve / reject a leave request (admin only)
router.post('/requests/:id/decision', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { decision } = req.body || {}; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'." });
  }

  const reqRow = db.prepare(`SELECT * FROM leave_requests WHERE id = ?`).get(id);
  if (!reqRow) return res.status(404).json({ error: 'Leave request not found.' });
  if (reqRow.status !== 'pending') {
    return res.status(409).json({ error: 'This request has already been reviewed.' });
  }

  db.prepare(`
    UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(decision, req.user.id, id);

  if (decision === 'approved') {
    const year = new Date(reqRow.start_date).getFullYear();
    ensureBalance(reqRow.employee_id, reqRow.leave_type_id, year);
    db.prepare(`
      UPDATE leave_balances SET used = used + ?
      WHERE employee_id = ? AND leave_type_id = ? AND year = ?
    `).run(reqRow.days, reqRow.employee_id, reqRow.leave_type_id, year);

    // Mark attendance as 'leave' for each day in range
    const start = new Date(reqRow.start_date);
    const end = new Date(reqRow.end_date);
    const upsert = db.prepare(`
      INSERT INTO attendance (employee_id, date, status) VALUES (?, ?, 'leave')
      ON CONFLICT(employee_id, date) DO UPDATE SET status = 'leave'
    `);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      upsert.run(reqRow.employee_id, d.toISOString().slice(0, 10));
    }
  }

  // Send automated email notification to employee
  try {
    const empInfo = db.prepare(`
      SELECT e.full_name, u.email 
      FROM employees e 
      JOIN users u ON u.id = e.user_id 
      WHERE e.id = ?
    `).get(reqRow.employee_id);
    
    const ltInfo = db.prepare(`SELECT name FROM leave_types WHERE id = ?`).get(reqRow.leave_type_id);
    
    if (empInfo) {
      sendMail({
        to: empInfo.email,
        subject: `Leave Request Status Update: ${decision.toUpperCase()}`,
        text: `Dear ${empInfo.full_name},\n\nYour leave request for ${reqRow.days} day(s) of ${ltInfo ? ltInfo.name : 'Leave'} (Period: ${reqRow.start_date} to ${reqRow.end_date}) has been ${decision}.\n\nBest regards,\nBrandigade HR Team`
      });
    }
  } catch (err) {
    console.error('Error sending leave decision email notification:', err);
  }

  res.json({ ok: true, status: decision });
});

module.exports = router;
