const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function generateTempPassword() {
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '!1';
}

function nextEmployeeCode() {
  const row = db.prepare(`SELECT employee_code FROM employees ORDER BY id DESC LIMIT 1`).get();
  let next = 1;
  if (row && row.employee_code) {
    const match = row.employee_code.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return 'EMP-' + String(next).padStart(4, '0');
}

// List all employees (admin: full list, employee: only self + org chart names)
router.get('/', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    const rows = db.prepare(`
      SELECT e.*, u.email, u.is_active AS account_active, u.last_login_at
      FROM employees e
      LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.id ASC
    `).all();
    return res.json(rows);
  }
  // Employees can see a directory (name, designation, department, manager) but not salary/personal info of others
  const rows = db.prepare(`
    SELECT id, full_name, designation, department, manager_id
    FROM employees
    ORDER BY id ASC
  `).all();
  res.json(rows);
});

// Org chart (tree)
router.get('/org-chart', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, full_name, designation, department, manager_id FROM employees`).all();
  const byId = {};
  rows.forEach(r => { byId[r.id] = { ...r, children: [] }; });
  const roots = [];
  rows.forEach(r => {
    if (r.manager_id && byId[r.manager_id]) {
      byId[r.manager_id].children.push(byId[r.id]);
    } else {
      roots.push(byId[r.id]);
    }
  });
  res.json(roots);
});

// Get single employee (admin, or self)
router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role !== 'admin' && req.user.employeeId !== id) {
    return res.status(403).json({ error: 'You can only view your own record.' });
  }
  const emp = db.prepare(`
    SELECT e.*, u.email, u.is_active AS account_active
    FROM employees e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.id = ?
  `).get(id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  const salaryHistory = db.prepare(`
    SELECT * FROM salary_history WHERE employee_id = ? ORDER BY effective_date DESC
  `).all(id);

  res.json({ ...emp, salaryHistory });
});

// Create employee + generate login (this is the "license" / seat creation)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const {
    fullName, email, designation, department, managerId,
    dateOfJoining, baseSalary, phone, cnicOrId, bankAccount, address, emergencyContact,
    shiftStart, shiftEnd,
  } = req.body || {};

  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const tempPassword = generateTempPassword();
  const hash = bcrypt.hashSync(tempPassword, 12);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, role, is_active, must_change_password)
    VALUES (?, ?, 'employee', 1, 1)
  `);
  const userResult = insertUser.run(normalizedEmail, hash);

  const code = nextEmployeeCode();
  const insertEmp = db.prepare(`
    INSERT INTO employees (
      user_id, employee_code, full_name, designation, department, manager_id,
      date_of_joining, employment_status, base_salary, phone, cnic_or_id, bank_account, address, emergency_contact,
      shift_start, shift_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const empResult = insertEmp.run(
    userResult.lastInsertRowid, code, fullName, designation || null, department || null,
    managerId || null, dateOfJoining || null, Number(baseSalary) || 0,
    phone || null, cnicOrId || null, bankAccount || null, address || null, emergencyContact || null,
    shiftStart || '09:30', shiftEnd || '18:30'
  );

  db.prepare(`INSERT INTO audit_log (user_id, action, details) VALUES (?, 'create_employee', ?)`)
    .run(req.user.id, JSON.stringify({ employeeId: empResult.lastInsertRowid, email: normalizedEmail }));

  res.status(201).json({
    employeeId: empResult.lastInsertRowid,
    employeeCode: code,
    email: normalizedEmail,
    temporaryPassword: tempPassword,
    note: 'Share this temporary password with the employee securely. They will be required to change it on first login.',
  });
});

// Update employee record (admin only for most fields; employee can update own contact info)
router.put('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user.employeeId === id;

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: 'Not allowed.' });
  }

  const emp = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  const body = req.body || {};
  const fields = isAdmin
    ? ['full_name', 'designation', 'department', 'manager_id', 'date_of_joining', 'employment_status', 'phone', 'cnic_or_id', 'bank_account', 'address', 'emergency_contact', 'shift_start', 'shift_end', 'base_salary']
    : ['phone', 'address', 'emergency_contact'];

  const updates = [];
  const values = [];
  const keyMap = {
    full_name: 'fullName', designation: 'designation', department: 'department', manager_id: 'managerId',
    date_of_joining: 'dateOfJoining', employment_status: 'employmentStatus', phone: 'phone',
    cnic_or_id: 'cnicOrId', bank_account: 'bankAccount', address: 'address', emergency_contact: 'emergencyContact',
    shift_start: 'shiftStart', shift_end: 'shiftEnd', base_salary: 'baseSalary',
  };

  for (const col of fields) {
    const bodyKey = keyMap[col];
    if (bodyKey in body) {
      updates.push(`${col} = ?`);
      values.push(body[bodyKey]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  values.push(id);
  db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Salary increment (admin only) - logs history and updates current salary
router.post('/:id/salary-increment', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { newSalary, reason, effectiveDate } = req.body || {};

  if (newSalary === undefined || Number.isNaN(Number(newSalary))) {
    return res.status(400).json({ error: 'newSalary must be a number.' });
  }

  const emp = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  const effDate = effectiveDate || new Date().toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO salary_history (employee_id, old_salary, new_salary, reason, effective_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, emp.base_salary, Number(newSalary), reason || null, effDate, req.user.id);

  db.prepare(`UPDATE employees SET base_salary = ? WHERE id = ?`).run(Number(newSalary), id);

  res.json({ ok: true, oldSalary: emp.base_salary, newSalary: Number(newSalary) });
});

// Deactivate / reactivate an account (revoke or restore a "license")
router.post('/:id/account-status', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { isActive } = req.body || {};
  const emp = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!emp || !emp.user_id) return res.status(404).json({ error: 'Employee account not found.' });

  db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, emp.user_id);
  res.json({ ok: true, isActive: !!isActive });
});

// Admin can reset an employee's password (issue new temp password)
router.post('/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const emp = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!emp || !emp.user_id) return res.status(404).json({ error: 'Employee account not found.' });

  const tempPassword = generateTempPassword();
  const hash = bcrypt.hashSync(tempPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?`).run(hash, emp.user_id);

  res.json({ ok: true, temporaryPassword: tempPassword });
});

module.exports = router;
