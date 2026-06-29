const PDFDocument = require('pdfkit');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  return `${currency || 'PKR'} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Streams a payslip PDF to the given writable stream (e.g. an HTTP response).
 * payslip: { employee, periodMonth, periodYear, baseSalary, daysPresent, daysInPeriod,
 *            unpaidLeaveDeduction, bonus, otherDeductions, deductionNotes, bonusNotes, netPay }
 * company: { name, address }
 */
function generatePayslipPdf(stream, payslip, company) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  const blue = '#2E75B6';
  const dark = '#1A1A1A';
  const gray = '#666666';

  // Header
  doc.fontSize(20).fillColor(blue).font('Helvetica-Bold').text(company.name || 'Company', 50, 50);
  doc.fontSize(9).fillColor(gray).font('Helvetica').text(company.address || '', 50, 75);

  doc.moveTo(50, 100).lineTo(545, 100).strokeColor(blue).lineWidth(1.5).stroke();

  doc.fontSize(16).fillColor(dark).font('Helvetica-Bold').text('PAYSLIP', 50, 115);
  doc.fontSize(11).fillColor(gray).font('Helvetica')
    .text(`For ${MONTH_NAMES[payslip.periodMonth - 1]} ${payslip.periodYear}`, 50, 138);

  // Employee info box
  let y = 170;
  doc.fontSize(10).fillColor(dark).font('Helvetica-Bold').text('Employee Details', 50, y);
  y += 18;
  const empRows = [
    ['Name', payslip.employee.full_name],
    ['Employee Code', payslip.employee.employee_code],
    ['Designation', payslip.employee.designation || '-'],
    ['Department', payslip.employee.department || '-'],
    ['Date of Joining', payslip.employee.date_of_joining || '-'],
  ];
  doc.font('Helvetica').fontSize(10);
  empRows.forEach(([label, val]) => {
    doc.fillColor(gray).text(label, 50, y, { width: 150, continued: false });
    doc.fillColor(dark).text(String(val || '-'), 220, y);
    y += 16;
  });

  y += 10;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#DDDDDD').lineWidth(1).stroke();
  y += 20;

  // Attendance summary
  doc.fontSize(10).fillColor(dark).font('Helvetica-Bold').text('Attendance Summary', 50, y);
  y += 18;
  doc.font('Helvetica').fontSize(10);
  doc.fillColor(gray).text('Days in Period', 50, y);
  doc.fillColor(dark).text(String(payslip.daysInPeriod), 220, y);
  y += 16;
  doc.fillColor(gray).text('Days Present', 50, y);
  doc.fillColor(dark).text(String(payslip.daysPresent), 220, y);
  y += 16;
  if (payslip.showups !== undefined) {
    doc.fillColor(gray).text('Showups / Scheduled / No-Shows', 50, y);
    doc.fillColor(dark).text(`${payslip.showups} / ${payslip.meetingsScheduled || 0} / ${payslip.noShows || 0}`, 220, y);
    y += 16;
  }
  y += 10;

  // Earnings & Deductions table
  doc.fontSize(10).fillColor(dark).font('Helvetica-Bold').text('Earnings', 50, y);
  doc.text('Amount', 420, y);
  y += 6;
  doc.moveTo(50, y + 12).lineTo(545, y + 12).strokeColor('#DDDDDD').stroke();
  y += 20;

  doc.font('Helvetica').fontSize(10);
  doc.fillColor(gray).text('Base Salary (pro-rated)', 50, y);
  doc.fillColor(dark).text(formatMoney(payslip.baseSalary, payslip.employee.currency), 420, y);
  y += 18;

  if (payslip.commission && payslip.commission > 0) {
    doc.fillColor(gray).text('Commission', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.commission, payslip.employee.currency), 420, y);
    y += 18;
  }

  if (payslip.spiffs && payslip.spiffs > 0) {
    doc.fillColor(gray).text('Spiffs', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.spiffs, payslip.employee.currency), 420, y);
    y += 18;
  }

  if (payslip.bonus && payslip.bonus > 0) {
    doc.fillColor(gray).text('Bonus' + (payslip.bonusNotes ? ` (${payslip.bonusNotes})` : ''), 50, y, { width: 350 });
    doc.fillColor(dark).text(formatMoney(payslip.bonus, payslip.employee.currency), 420, y);
    y += 18;
  }

  y += 8;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(dark).text('Deductions', 50, y);
  doc.text('Amount', 420, y);
  y += 6;
  doc.moveTo(50, y + 12).lineTo(545, y + 12).strokeColor('#DDDDDD').stroke();
  y += 20;

  doc.font('Helvetica').fontSize(10);
  if (payslip.unpaidLeaveDeduction && payslip.unpaidLeaveDeduction > 0) {
    doc.fillColor(gray).text('Unpaid Leave Deduction', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.unpaidLeaveDeduction, payslip.employee.currency), 420, y);
    y += 18;
  }
  if (payslip.otherDeductions && payslip.otherDeductions > 0) {
    doc.fillColor(gray).text('Other Deductions' + (payslip.deductionNotes ? ` (${payslip.deductionNotes})` : ''), 50, y, { width: 350 });
    doc.fillColor(dark).text(formatMoney(payslip.otherDeductions, payslip.employee.currency), 420, y);
    y += 18;
  }
  if ((!payslip.unpaidLeaveDeduction || payslip.unpaidLeaveDeduction === 0) && (!payslip.otherDeductions || payslip.otherDeductions === 0)) {
    doc.fillColor(gray).text('None', 50, y);
    y += 18;
  }

  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(blue).lineWidth(1.5).stroke();
  y += 16;

  doc.font('Helvetica-Bold').fontSize(13).fillColor(blue).text('Net Pay', 50, y);
  doc.text(formatMoney(payslip.netPay, payslip.employee.currency), 420, y);

  y += 50;
  doc.font('Helvetica').fontSize(8).fillColor(gray)
    .text('This is a system-generated payslip and does not require a signature.', 50, y);

  doc.end();
}

module.exports = { generatePayslipPdf };
