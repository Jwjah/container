const nodemailer = require('nodemailer');
require('dotenv').config();

const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false // Helps avoid issues with some cloud providers
  }
});

transporter.verify()
  .then(() => console.log('✅ SMTP ready'))
  .catch(err => console.warn('⚠️  SMTP verification failed (will retry on send):', err.message));

const sendOTP = async (email, otp, purpose = 'verification') => {
  const subjects = {
    register: '🔐 CampusPrint — Verify Your Email',
    login: '🔑 CampusPrint — Login OTP',
    reset: '🔄 CampusPrint — Password Reset',
    verification: '🔐 CampusPrint — Email Verification',
  };

  const html = `
    <div style="font-family:'Inter',sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:linear-gradient(135deg,#0f0f23 0%,#1a1a3e 100%);border-radius:16px;color:#fff;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="font-size:28px;font-weight:700;background:linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;">
          CampusPrint
        </h1>
        <p style="color:#94a3b8;font-size:14px;margin-top:4px;">Campus Printing Made Easy</p>
      </div>
      <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:32px;text-align:center;">
        <p style="color:#cbd5e1;font-size:15px;margin:0 0 24px;">Your verification code is:</p>
        <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#a78bfa;padding:16px;background:rgba(99,102,241,0.1);border-radius:8px;border:1px dashed rgba(99,102,241,0.3);">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">This code expires in <strong style="color:#f59e0b;">10 minutes</strong>.</p>
      </div>
      <p style="color:#475569;font-size:12px;text-align:center;margin-top:24px;">
        If you didn't request this, please ignore this email.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"CampusPrint" <${process.env.SMTP_USER}>`,
      to: email,
      subject: subjects[purpose] || subjects.verification,
      html,
    });
    console.log(`📧 OTP email sent to ${email}`);
  } catch (err) {
    console.error(`❌ Failed to send OTP email to ${email}:`, err.message);
    throw new Error('Email delivery failed. Please check your SMTP configuration.');
  }
};

module.exports = { sendOTP };
