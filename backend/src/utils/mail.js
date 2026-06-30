const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');

// Configure transporter from .env (SMTP may be optional)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 0),
  secure: false, // TLS will be upgraded via STARTTLS if supported
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

/**
 * Generate a PDF buffer for a payslip using the existing generatePayslipPdf utility.
 * This returns a Buffer that can be attached to an email.
 */
function generatePayslipPdfBuffer(payslip, company = { name: 'Brandigade', address: 'Karachi, Pakistan' }) {
  return new Promise((resolve, reject) => {
    // The original generatePayslipPdf writes to a stream; we capture that stream.
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    // Pipe the PDFKit document into our PassThrough stream.
    doc.pipe(stream);
    // Reuse the rendering logic from the utils file.
    const { generatePayslipPdf } = require('../utils/payslipPdf');
    generatePayslipPdf(doc, payslip, company);
    doc.end();
  });
}

/**
 * Send a payslip PDF to the employee via email.
 */
async function sendPayslipEmail(toEmail, payslip, pdfBuffer) {
  if (!toEmail) return; // nothing to send
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const periodMonth = payslip.payrollRun?.periodMonth || '';
  const periodYear = payslip.payrollRun?.periodYear || '';
  const subject = `Your payslip for ${monthNames[periodMonth - 1]} ${periodYear}`;
  const text = `Dear ${payslip.employee?.fullName || ''},\n\nYour payslip for ${monthNames[periodMonth - 1]} ${periodYear} is attached.\n\nBest regards,\nHR Department`;

  await transporter.sendMail({
    from: 'hr@brandigade.com',
    to: toEmail,
    subject,
    text,
    attachments: [{
      filename: `payslip-${payslip.id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });
  console.log(`✅ Email sent to ${toEmail} for payslip ${payslip.id}`);
}

module.exports = { generatePayslipPdfBuffer, sendPayslipEmail };
