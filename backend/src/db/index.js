const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

require('dotenv').config();

const DB_PATH = process.env.DB_PATH || (process.env.VERCEL ? '/tmp/hris.db' : './data/hris.db');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const raw = new DatabaseSync(DB_PATH);
raw.exec('PRAGMA journal_mode = WAL;');
raw.exec('PRAGMA foreign_keys = ON;');

// Thin compatibility wrapper so route code can use the familiar
// better-sqlite3-style db.prepare(sql).get/.all/.run(...args) API.
const db = {
  exec(sql) {
    raw.exec(sql);
  },
  prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
      run: (...args) => {
        const info = stmt.run(...args);
        return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
      },
    };
  },
  transaction(fn) {
    return (...args) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    };
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'employee')) DEFAULT 'employee',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  date_of_joining TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK(employment_status IN ('active', 'on_leave', 'terminated', 'resigned')),
  base_salary REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PKR',
  phone TEXT,
  cnic_or_id TEXT,
  bank_account TEXT,
  address TEXT,
  emergency_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salary_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  old_salary REAL,
  new_salary REAL NOT NULL,
  reason TEXT,
  effective_date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  annual_allowance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  allocated REAL NOT NULL DEFAULT 0,
  used REAL NOT NULL DEFAULT 0,
  UNIQUE(employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'half_day', 'leave', 'holiday', 'weekend')),
  note TEXT,
  check_in TEXT,
  check_out TEXT,
  late INTEGER NOT NULL DEFAULT 0,
  late_notified INTEGER NOT NULL DEFAULT 0,
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'finalized')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  UNIQUE(period_month, period_year)
);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary REAL NOT NULL,
  days_present REAL NOT NULL DEFAULT 0,
  days_in_period INTEGER NOT NULL DEFAULT 0,
  unpaid_leave_deduction REAL NOT NULL DEFAULT 0,
  bonus REAL NOT NULL DEFAULT 0,
  other_deductions REAL NOT NULL DEFAULT 0,
  deduction_notes TEXT,
  bonus_notes TEXT,
  net_pay REAL NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration scripts to ensure column schema updates for existing database files
try { db.exec("ALTER TABLE attendance ADD COLUMN check_in TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE attendance ADD COLUMN check_out TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE attendance ADD COLUMN late INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE attendance ADD COLUMN late_notified INTEGER DEFAULT 0;"); } catch (e) {}

  // Migration: add gmail column to employees
  try { db.exec("ALTER TABLE employees ADD COLUMN gmail TEXT;"); } catch (e) {}

  // Create projects (teams) table
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );
  `); } catch (e) {}

  // Employee to project assignment with role (e.g., 'member', 'team_lead')
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS employee_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('member', 'team_lead', 'admin', 'sdr', 'ceo', 'coo')),
      UNIQUE(employee_id, project_id)
    );
  `); } catch (e) {}

  // Commission structures per project and role (admin defines)
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('team_lead', 'sdr', 'admin', 'ceo', 'coo')),
      amount REAL NOT NULL,
      UNIQUE(project_id, role)
    );
  `); } catch (e) {}

  // Spiffs log (admin or team lead can give)
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS spiffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      given_by INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      reason TEXT,
      date TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `); } catch (e) {}
try { db.exec("ALTER TABLE employees ADD COLUMN shift_start TEXT DEFAULT '09:30';"); } catch (e) {}
try { db.exec("ALTER TABLE employees ADD COLUMN shift_end TEXT DEFAULT '18:30';"); } catch (e) {}

try { db.exec("ALTER TABLE payslips ADD COLUMN showups INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE payslips ADD COLUMN meetings_scheduled INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE payslips ADD COLUMN no_shows INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE payslips ADD COLUMN commission REAL DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE payslips ADD COLUMN spiffs REAL DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE payslips ADD COLUMN loans_deduction REAL DEFAULT 0;"); } catch (e) {}

// Create loan_requests table
db.exec(`
CREATE TABLE IF NOT EXISTS loan_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('loan', 'advance')),
  amount REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  requested_date TEXT NOT NULL DEFAULT (date('now')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  repayment_month INTEGER,
  repayment_year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;

