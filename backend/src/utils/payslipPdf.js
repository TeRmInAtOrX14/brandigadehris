const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMoney(amount) {
  const n = Number(amount) || 0;
  return `PKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generates a payslip PDF and pipes it to a writable stream.
 * payslip: { employee, periodMonth, periodYear, baseSalary, daysPresent, daysInPeriod,
 *            unpaidLeaveDeduction, lateDeduction, loansDeduction, bonus, spiffs, commission,
 *            otherDeductions, deductionNotes, bonusNotes, netPay, showups, meetingsScheduled, noShows }
 * company: { name, address }
 */
function generatePayslipPdf(stream, payslip, company = { name: 'Brandigade', address: 'Karachi, Pakistan' }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);

  const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 45, { width: 50 });
    doc.moveDown();
  }

  const blue = '#2E75B6';
  const dark = '#1A1A1A';
  const gray = '#666666';

  // Header
  doc.fontSize(20).fillColor(blue).font('Helvetica-Bold').text(company.name || 'Brandigade', 50, 50);
  doc.fontSize(9).fillColor(gray).font('Helvetica').text(company.address || 'Karachi, Pakistan', 50, 75);

  doc.moveTo(50, 100).lineTo(545, 100).strokeColor(blue).lineWidth(1.5).stroke();

  doc.fontSize(16).fillColor(dark).font('Helvetica-Bold').text('PAYSLIP', 50, 115);
  doc.fontSize(11).fillColor(gray).font('Helvetica')
    .text(`For ${MONTH_NAMES[payslip.periodMonth - 1]} ${payslip.periodYear}`, 50, 138);

  // Employee info box
  let y = 170;
  doc.fontSize(10).fillColor(dark).font('Helvetica-Bold').text('Employee Details', 50, y);
  y += 18;
  const empRows = [
    ['Name', payslip.employee.fullName],
    ['Employee Code', payslip.employee.employeeCode],
    ['Designation', payslip.employee.designation || '-'],
    ['Campaign', payslip.employee.campaignMembers?.[0]?.campaign?.name || '-'],
    ['Date of Joining', payslip.employee.dateOfJoining ? new Date(payslip.employee.dateOfJoining).toDateString() : '-'],
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
  doc.fontSize(10).fillColor(dark).font('Helvetica-Bold').text('Attendance & Activity Summary', 50, y);
  y += 18;
  doc.font('Helvetica').fontSize(10);
  doc.fillColor(gray).text('Days in Period', 50, y);
  doc.fillColor(dark).text(String(payslip.daysInPeriod), 220, y);
  y += 16;
  doc.fillColor(gray).text('Days Worked / Accounted', 50, y);
  doc.fillColor(dark).text(String(payslip.daysPresent), 220, y);
  y += 16;
  if (payslip.showups !== undefined && payslip.showups > 0) {
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
  doc.fillColor(dark).text(formatMoney(payslip.baseSalary), 420, y);
  y += 18;

  if (payslip.commission && payslip.commission > 0) {
    doc.fillColor(gray).text('Commission (Campaign Success)', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.commission), 420, y);
    y += 18;
  }

  if (payslip.spiffs && payslip.spiffs > 0) {
    doc.fillColor(gray).text('Spiffs (Individual Incentives)', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.spiffs), 420, y);
    y += 18;
  }

  if (payslip.bonus && payslip.bonus > 0) {
    doc.fillColor(gray).text('Bonus' + (payslip.bonusNotes ? ` (${payslip.bonusNotes})` : ''), 50, y, { width: 350 });
    doc.fillColor(dark).text(formatMoney(payslip.bonus), 420, y);
    y += 18;
  }

  y += 8;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(dark).text('Deductions', 50, y);
  doc.text('Amount', 420, y);
  y += 6;
  doc.moveTo(50, y + 12).lineTo(545, y + 12).strokeColor('#DDDDDD').stroke();
  y += 20;

  doc.font('Helvetica').fontSize(10);
  let hasDeductions = false;

  if (payslip.unpaidLeaveDeduction && payslip.unpaidLeaveDeduction > 0) {
    doc.fillColor(gray).text('Unpaid Leave Deduction', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.unpaidLeaveDeduction), 420, y);
    y += 18;
    hasDeductions = true;
  }
  if (payslip.lateDeduction && payslip.lateDeduction > 0) {
    doc.fillColor(gray).text('Late Check-In Penalties', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.lateDeduction), 420, y);
    y += 18;
    hasDeductions = true;
  }
  if (payslip.loansDeduction && payslip.loansDeduction > 0) {
    doc.fillColor(gray).text('Loan / Advance Installment', 50, y);
    doc.fillColor(dark).text(formatMoney(payslip.loansDeduction), 420, y);
    y += 18;
    hasDeductions = true;
  }
  if (payslip.otherDeductions && payslip.otherDeductions > 0) {
    doc.fillColor(gray).text('Other Deductions' + (payslip.deductionNotes ? ` (${payslip.deductionNotes})` : ''), 50, y, { width: 350 });
    doc.fillColor(dark).text(formatMoney(payslip.otherDeductions), 420, y);
    y += 18;
    hasDeductions = true;
  }
  
  if (!hasDeductions) {
    doc.fillColor(gray).text('No deductions for this period', 50, y);
    y += 18;
  }

  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(blue).lineWidth(1.5).stroke();
  y += 16;

  doc.font('Helvetica-Bold').fontSize(13).fillColor(blue).text('Net Pay', 50, y);
  doc.text(formatMoney(payslip.netPay), 420, y);

  y += 50;
  doc.font('Helvetica').fontSize(8).fillColor(gray)
    .text('This is a system-generated payslip and does not require a signature.', 50, y);

  doc.end();
}

module.exports = { generatePayslipPdf };
