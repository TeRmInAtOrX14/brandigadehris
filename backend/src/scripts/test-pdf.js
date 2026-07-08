const { generatePayslipPdf } = require('../utils/payslipPdf');
const fs = require('fs');

const mockPayslip = {
  periodMonth: 6,
  periodYear: 2026,
  generatedAt: new Date(),
  baseSalary: 80000,
  spiffs: 1500,
  commission: 4500,
  bonus: 2000,
  bonusNotes: 'Top Performer',
  unpaidLeaveDeduction: 0,
  lateDeduction: 0,
  loansDeduction: 5000,
  otherDeductions: 0,
  employee: {
    fullName: 'Muhammad Ali',
    employeeCode: 'BG-0012',
    designation: 'Sales Development Representative (SDR)',
    bankAccount: 'Meezan Bank - 12345678901234',
    campaignMembers: [
      {
        role: 'sdr',
        campaign: {
          name: 'Cleo HR'
        }
      }
    ]
  }
};

const stream = fs.createWriteStream('./test-payslip.pdf');
generatePayslipPdf(stream, mockPayslip);
console.log('PDF Generated successfully to ./test-payslip.pdf');
