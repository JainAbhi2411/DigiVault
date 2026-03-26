const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  // If SMTP creds are missing, throw a clear error (don't silently simulate)
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const msg = 'Email not configured: SMTP_USER and SMTP_PASS environment variables are missing on the server. Add them in your Render dashboard under Environment.';
    console.error('[MAILER]', msg);
    throw new Error(msg);
  }
  try {
    const info = await transporter.sendMail({
      from:    process.env.SMTP_FROM || `"Digital Vault" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[MAILER] Sent to ${to} (msgId: ${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[MAILER] Failed to send to ${to}:`, err.message);
    throw new Error(`Email delivery failed: ${err.message}`);
  }
};

module.exports = { sendEmail };
