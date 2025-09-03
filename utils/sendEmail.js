const nodemailer = require("nodemailer");
require("dotenv").config();

const sendEmail = async ({ to, subject, text, html, attachments }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com", // 👈 likely SMTP for cPanel
      port: 465,
      secure: true, // true for 465 (SSL), false for 587 (TLS)
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Optional, safer to test without it first
      },
    });

    const mailOptions = {
      from: `"Close Friends Traders" <support@closefriendstraders.com>`,
      to: `"Valued Member" <support@closefriendstraders.com>`, // generic or your own address
      bcc: to, // pass array or comma-separated list of real recipients
      subject,
      text,
      html,
      attachments,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
  }
};

module.exports = sendEmail;
