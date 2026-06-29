const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { generatePayslipPdf } = require('../utils/payslipPdf');
const { sendMail } = require('../utils/mailer');
const { PassThrough } = require('stream');

const router = express.Router();

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

// Create or fetch the draft payroll run for a period
router.post('/runs', requireAuth, requireAdmin, (req, res) => {
  const { month, year } = req.body || {};
  if (!month || !year) return res.status(400).json({ error: 'month and year are required.' });

  let run = db.prepare(`SELECT * FROM payroll_runs WHERE period_month = ? AND period_year = ?`).get(month, year);
  if (!run) {
    const result = db.prepare(`
      INSERT INTO payroll_runs (period_month, period_year, status, created_by) VALUES (?, ?, 'draft', ?)
    `).run(month, year, req.user.id);
    run = db.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).get(result.lastInsertRowid);
  }
  res.json(run);
});

router.get('/runs', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT * FROM payroll_runs ORDER BY period_year DESC, period_month DESC`).all());
});

/**
 * Calculate (preview) payslips for every active employee for a given run, without saving.
 * Pulls attendance for the period to compute pro-rated pay.
 */
function calculatePayslips(runId, periodMonth, periodYear, overrides) {
  const totalDays = daysInMonth(periodMonth, periodYear);
  const from = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
  const to = `${periodYear}-${String(periodMonth).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;

  const employees = db.prepare(`SELECT * FROM employees WHERE employment_status = 'active'`).all();
  const overrideMap = {};
  (overrides || []).forEach(o => { overrideMap[o.employeeId] = o; });

  return employees.map(emp => {
    const attendanceRows = db.prepare(`
      SELECT status, COUNT(*) as cnt FROM attendance
      WHERE employee_id = ? AND date BETWEEN ? AND ?
      GROUP BY status
    `).all(emp.id, from, to);

    const lateRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM attendance
      WHERE employee_id = ? AND date BETWEEN ? AND ? AND late = 1
    `).get(emp.id, from, to);
    const lates = lateRow ? lateRow.cnt : 0;

    let present = 0, holidays = 0, weekends = 0, leaves = 0, halfDays = 0, absents = 0;
    attendanceRows.forEach(r => {
      if (r.status === 'present') present = r.cnt;
      else if (r.status === 'holiday') holidays = r.cnt;
      else if (r.status === 'weekend') weekends = r.cnt;
      else if (r.status === 'leave') leaves = r.cnt;
      else if (r.status === 'half_day') halfDays = r.cnt;
      else if (r.status === 'absent') absents = r.cnt;
    });

    // Leaves accountability: 1 day of paid casual leave allowed per month.
    const excessLeaves = Math.max(0, leaves - 1);

    // Lates and half days accountability:
    // - 3 lates = 1 off (unpaid day)
    // - 2 half-days = 1 off (unpaid day)
    const lateOffs = Math.floor(lates / 3);
    const halfDayOffs = Math.floor(halfDays / 2);

    const unpaidDays = absents + excessLeaves + lateOffs + halfDayOffs;
    const daysPresentEquivalent = Math.max(0, totalDays - unpaidDays);

    const perDayRate = totalDays > 0 ? emp.base_salary / totalDays : 0;
    const unpaidLeaveDeduction = Math.round(perDayRate * unpaidDays * 100) / 100;

    const override = overrideMap[emp.id] || {};
    const bonus = Number(override.bonus) || 0;
    const otherDeductions = Number(override.otherDeductions) || 0;

    const showups = Number(override.showups) || 0;
    const meetingsScheduled = Number(override.meetingsScheduled) || 0;
    const noShows = Number(override.noShows) || 0;
    // Compute commission based on number of showups and admin-defined rate per project/role
    let commission = 0;
    try {
      const proj = db.prepare(`SELECT ep.project_id, ep.role FROM employee_projects ep WHERE ep.employee_id = ?`).get(emp.id);
      if (proj) {
        const rateRow = db.prepare(`SELECT amount FROM commissions WHERE project_id = ? AND role = ?`).get(proj.project_id, proj.role);
        if (rateRow) {
          commission = Number(rateRow.amount) * showups;
        }
      }
    } catch (e) {
      console.error('Commission calculation error', e);
    }
    const spiffs = Number(override.spiffs) || 0;

    const netPay = Math.round((emp.base_salary - unpaidLeaveDeduction + bonus - otherDeductions + commission + spiffs) * 100) / 100;

    return {
      employeeId: emp.id,
      employee: emp,
      baseSalary: emp.base_salary,
      daysInPeriod: totalDays,
      daysPresent: daysPresentEquivalent,
      unpaidLeaveDeduction,
      bonus,
      bonusNotes: override.bonusNotes || null,
      otherDeductions,
      deductionNotes: override.deductionNotes || null,
      showups,
      meetingsScheduled,
      noShows,
      commission,
      spiffs,
      netPay,
    };
  });
}

// Preview payroll for a run (does not save)
router.get('/runs/:id/preview', requireAuth, requireAdmin, (req, res) => {
  const run = db.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).get(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  const result = calculatePayslips(run.id, run.period_month, run.period_year, []);
  res.json(result);
});

// Finalize payroll: calculate, save payslips, lock the run
router.post('/runs/:id/finalize', requireAuth, requireAdmin, (req, res) => {
  const run = db.prepare(`SELECT * FROM payroll_runs WHERE id = ?`).get(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  if (run.status === 'finalized') return res.status(409).json({ error: 'This payroll run is already finalized.' });

  const { overrides } = req.body || {}; // [{ employeeId, bonus, bonusNotes, otherDeductions, deductionNotes, showups, meetingsScheduled, noShows }]
  const computed = calculatePayslips(run.id, run.period_month, run.period_year, overrides);

  const insertPayslip = db.prepare(`
    INSERT INTO payslips (
      payroll_run_id, employee_id, base_salary, days_present, days_in_period,
      unpaid_leave_deduction, bonus, other_deductions, deduction_notes, bonus_notes,
      showups, meetings_scheduled, no_shows, commission, spiffs, net_pay
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(payroll_run_id, employee_id) DO UPDATE SET
      base_salary = excluded.base_salary,
      days_present = excluded.days_present,
      days_in_period = excluded.days_in_period,
      unpaid_leave_deduction = excluded.unpaid_leave_deduction,
      bonus = excluded.bonus,
      other_deductions = excluded.other_deductions,
      deduction_notes = excluded.deduction_notes,
      bonus_notes = excluded.bonus_notes,
      showups = excluded.showups,
      meetings_scheduled = excluded.meetings_scheduled,
      no_shows = excluded.no_shows,
      commission = excluded.commission,
      spiffs = excluded.spiffs,
      net_pay = excluded.net_pay
  `);

  const tx = db.transaction(() => {
    for (const p of computed) {
      insertPayslip.run(
        run.id, p.employeeId, p.baseSalary, p.daysPresent, p.daysInPeriod,
        p.unpaidLeaveDeduction, p.bonus, p.otherDeductions, p.deductionNotes, p.bonusNotes,
        p.showups, p.meetingsScheduled, p.noShows, p.commission, p.spiffs, p.netPay
      );
    }
    db.prepare(`UPDATE payroll_runs SET status = 'finalized', finalized_at = datetime('now') WHERE id = ?`).run(run.id);
  });
  tx();

  db.prepare(`INSERT INTO audit_log (user_id, action, details) VALUES (?, 'finalize_payroll', ?)`)
    .run(req.user.id, JSON.stringify({ runId: run.id, employeeCount: computed.length }));

  // Fire-and-forget: email each employee their payslip PDF
  const company = { name: process.env.COMPANY_NAME || 'Company', address: process.env.COMPANY_ADDRESS || '' };
  for (const p of computed) {
    try {
      const empUser = db.prepare(`SELECT u.email FROM users u JOIN employees e ON e.user_id = u.id WHERE e.id = ?`).get(p.employeeId);
      if (!empUser || !empUser.email) continue;

      // Generate PDF into a memory buffer
      const buffers = [];
      const pt = new PassThrough();
      pt.on('data', chunk => buffers.push(chunk));
      pt.on('end', async () => {
        const pdfBuffer = Buffer.concat(buffers);
        const monthName = new Date(run.period_year, run.period_month - 1, 1)
          .toLocaleString('en', { month: 'long', year: 'numeric' });
        await sendMail({
          to: empUser.email,
          subject: `Your Payslip for ${monthName} is Ready`,
          text: `Dear ${p.employee.full_name},\n\nPlease find your payslip for ${monthName} attached.\n\nNet Pay: ${p.employee.currency || 'PKR'} ${p.netPay.toLocaleString()}\n\nBest regards,\nBrandigade HR Team`,
          attachments: [{
            filename: `payslip-${p.employee.employee_code}-${run.period_year}-${run.period_month}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });
      });
      generatePayslipPdf(pt, {
        employee: p.employee,
        periodMonth: run.period_month,
        periodYear: run.period_year,
        baseSalary: p.baseSalary,
        daysPresent: p.daysPresent,
        daysInPeriod: p.daysInPeriod,
        unpaidLeaveDeduction: p.unpaidLeaveDeduction,
        bonus: p.bonus,
        bonusNotes: p.bonusNotes,
        otherDeductions: p.otherDeductions,
        deductionNotes: p.deductionNotes,
        showups: p.showups,
        meetingsScheduled: p.meetingsScheduled,
        noShows: p.noShows,
        commission: p.commission,
        spiffs: p.spiffs,
        netPay: p.netPay,
      }, company);
    } catch (emailErr) {
      console.error(`[Payroll] Failed to send payslip email to employee ${p.employeeId}:`, emailErr);
    }
  }

  res.json({ ok: true, payslipCount: computed.length });
});

// List payslips for a run
router.get('/runs/:id/payslips', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT ps.*, e.full_name, e.employee_code, e.currency
    FROM payslips ps JOIN employees e ON e.id = ps.employee_id
    WHERE ps.payroll_run_id = ?
    ORDER BY e.full_name
  `).all(Number(req.params.id));
  res.json(rows);
});

// Employee: list own payslips (across all runs)
router.get('/my-payslips', requireAuth, (req, res) => {
  if (!req.user.employeeId) return res.status(400).json({ error: 'No employee profile linked.' });
  const rows = db.prepare(`
    SELECT ps.*, pr.period_month, pr.period_year
    FROM payslips ps JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
    WHERE ps.employee_id = ? AND pr.status = 'finalized'
    ORDER BY pr.period_year DESC, pr.period_month DESC
  `).all(req.user.employeeId);
  res.json(rows);
});

// Download a single payslip PDF (admin for anyone, employee for self)
router.get('/payslips/:id/pdf', requireAuth, (req, res) => {
  const payslip = db.prepare(`
    SELECT ps.*, pr.period_month, pr.period_year, pr.status AS run_status
    FROM payslips ps JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
    WHERE ps.id = ?
  `).get(Number(req.params.id));
  if (!payslip) return res.status(404).json({ error: 'Payslip not found.' });

  if (req.user.role !== 'admin' && req.user.employeeId !== payslip.employee_id) {
    return res.status(403).json({ error: 'Not allowed.' });
  }

  const employee = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(payslip.employee_id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="payslip-${employee.employee_code}-${payslip.period_year}-${payslip.period_month}.pdf"`);

  generatePayslipPdf(res, {
    employee,
    periodMonth: payslip.period_month,
    periodYear: payslip.period_year,
    baseSalary: payslip.base_salary,
    daysPresent: payslip.days_present,
    daysInPeriod: payslip.days_in_period,
    unpaidLeaveDeduction: payslip.unpaid_leave_deduction,
    bonus: payslip.bonus,
    bonusNotes: payslip.bonus_notes,
    otherDeductions: payslip.other_deductions,
    deductionNotes: payslip.deduction_notes,
    showups: payslip.showups,
    meetingsScheduled: payslip.meetings_scheduled,
    noShows: payslip.no_shows,
    commission: payslip.commission,
    spiffs: payslip.spiffs,
    netPay: payslip.net_pay,
  }, {
    name: process.env.COMPANY_NAME || 'Company',
    address: process.env.COMPANY_ADDRESS || '',
  });
});

module.exports = router;
