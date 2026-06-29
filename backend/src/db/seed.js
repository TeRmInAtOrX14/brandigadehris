require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./index');

function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@brandigade.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  const existingAdmin = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();

  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    const insertUser = db.prepare(`
      INSERT INTO users (email, password_hash, role, is_active, must_change_password)
      VALUES (?, ?, 'admin', 1, 1)
    `);
    const result = insertUser.run(adminEmail, hash);

    db.prepare(`
      INSERT INTO employees (user_id, employee_code, full_name, designation, department, date_of_joining, employment_status, base_salary)
      VALUES (?, 'EMP-0001', ?, 'CEO & VP Growth', 'Management', date('now'), 'active', 0)
    `).run(result.lastInsertRowid, adminName);

    console.log(`Admin account created: ${adminEmail} / ${adminPassword}`);
    console.log('IMPORTANT: log in and change this password immediately.');
  } else {
    console.log('Admin account already exists, skipping admin creation.');
  }

  const defaultLeaveTypes = [
    { name: 'Annual Leave', annual_allowance: 14 },
    { name: 'Sick Leave', annual_allowance: 10 },
    { name: 'Casual Leave', annual_allowance: 7 },
    { name: 'Unpaid Leave', annual_allowance: 0 },
  ];

  const insertLeaveType = db.prepare(`
    INSERT INTO leave_types (name, annual_allowance) VALUES (?, ?)
    ON CONFLICT(name) DO NOTHING
  `);
  for (const lt of defaultLeaveTypes) {
    insertLeaveType.run(lt.name, lt.annual_allowance);
  }
  console.log('Default leave types ensured: ' + defaultLeaveTypes.map(l => l.name).join(', '));
}

seed();
