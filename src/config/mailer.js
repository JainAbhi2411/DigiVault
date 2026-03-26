const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[EMAIL SIMULATION] To: ${to} | Subject: ${subject}`);
    return { simulated: true };
  }
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `Digital Vault <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
  return info;
};

module.exports = { sendEmail };
