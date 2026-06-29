const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

const router = express.Router();

// ─── SUBMIT A LOAN/ADVANCE REQUEST (employee) ─────────────────────────────────

router.post('/requests', requireAuth, (req, res) => {
  const employeeId = req.user.employeeId;
  if (!employeeId) {
    return res.status(400).json({ error: 'No employee profile linked to this account.' });
  }

  const { type, amount, reason } = req.body || {};
  if (!type || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Type (loan or advance) and a valid amount are required.' });
  }

  if (!['loan', 'advance'].includes(type)) {
    return res.status(400).json({ error: "Type must be 'loan' or 'advance'." });
  }

  // default requested repayment target is next month
  const today = new Date();
  let nextMonth = today.getMonth() + 2; // JavaScript months are 0-indexed, so next month is getMonth() + 1 + 1
  let targetYear = today.getFullYear();
  if (nextMonth > 12) {
    nextMonth = 1;
    targetYear += 1;
  }

  const result = db.prepare(`
    INSERT INTO loan_requests (employee_id, type, amount, reason, repayment_month, repayment_year)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(employeeId, type, Number(amount), reason || null, nextMonth, targetYear);

  // Send email alert to admin
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const empInfo = db.prepare(`SELECT full_name FROM employees WHERE id = ?`).get(employeeId);
      sendMail({
        to: adminEmail,
        subject: `New Loan/Advance Request: ${empInfo ? empInfo.full_name : 'Employee'}`,
        text: `An employee has submitted a request for a ${type} of PKR ${Number(amount).toLocaleString()}.\n\nReason: ${reason || 'Not specified'}\n\nPlease review this request in the Brandigade HRIS Admin Panel.`
      });
    }
  } catch (err) {
    console.error('Error sending loan request email alert:', err);
  }

  res.status(201).json({ id: result.lastInsertRowid, type, amount, status: 'pending' });
});

// ─── LIST REQUESTS (admin sees all, employee sees own) ───────────────────────

router.get('/requests', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    const rows = db.prepare(`
      SELECT lr.*, e.full_name, e.employee_code
      FROM loan_requests lr
      JOIN employees e ON e.id = lr.employee_id
      ORDER BY lr.created_at DESC
    `).all();
    return res.json(rows);
  }

  const rows = db.prepare(`
    SELECT * FROM loan_requests
    WHERE employee_id = ?
    ORDER BY created_at DESC
  `).all(req.user.employeeId);
  res.json(rows);
});

// ─── APPROVE / DECLINE REQUEST (admin only) ───────────────────────────────────

router.post('/requests/:id/decision', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { decision, repaymentMonth, repaymentYear } = req.body || {}; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'." });
  }

  const reqRow = db.prepare(`SELECT * FROM loan_requests WHERE id = ?`).get(id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found.' });
  if (reqRow.status !== 'pending') {
    return res.status(409).json({ error: 'This request has already been reviewed.' });
  }

  const month = repaymentMonth ? Number(repaymentMonth) : reqRow.repayment_month;
  const year = repaymentYear ? Number(repaymentYear) : reqRow.repayment_year;

  db.prepare(`
    UPDATE loan_requests
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), repayment_month = ?, repayment_year = ?
    WHERE id = ?
  `).run(decision, req.user.id, month, year, id);

  // Notify employee via email
  try {
    const empUser = db.prepare(`
      SELECT u.email, e.full_name FROM users u
      JOIN employees e ON e.user_id = u.id
      WHERE e.id = ?
    `).get(reqRow.employee_id);
    if (empUser && empUser.email) {
      sendMail({
        to: empUser.email,
        subject: `Loan/Advance Request Status Updated — ${decision.toUpperCase()}`,
        text: `Dear ${empUser.full_name},\n\nYour request for a ${reqRow.type} of PKR ${reqRow.amount.toLocaleString()} has been ${decision} by the administrator.\n\nRepayment target: ${month}/${year}.\n\nBest regards,\nBrandigade HR Team`,
      });
    }
  } catch (err) {
    console.error('Error sending loan decision email:', err);
  }

  res.json({ ok: true, decision, repaymentMonth: month, repaymentYear: year });
});

module.exports = router;
