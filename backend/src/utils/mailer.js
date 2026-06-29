const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser;

// Initialize the Nodemailer transporter if config is present
let transporter = null;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: Number(smtpPort) === 465, // true for 465, false for 587 or other ports
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
} else {
  console.warn('[Mailer] WARNING: SMTP configuration is missing from environment variables. Emails will not be sent.');
}

/**
 * Sends an email using the configured SMTP server.
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {Array} [options.attachments] - Array of attachments
 * @returns {Promise<boolean>} Resolves to true if sent, false otherwise
 */
async function sendMail({ to, subject, text, html, attachments }) {
  if (!transporter) {
    console.warn(`[Mailer] SMTP not configured. Mail to ${to} not sent. Subject: ${subject}`);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text,
      html,
      attachments,
    });
    console.log(`[Mailer] Email successfully sent to ${to}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[Mailer] Failed to send email to ${to}:`, error);
    return false;
  }
}

module.exports = {
  sendMail,
};
