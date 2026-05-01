/**
 * Email Service — Uses Brevo (Sendinblue) HTTP API
 * Works on Render free tier because it uses HTTPS (port 443),
 * which is never blocked unlike SMTP ports (25, 465, 587).
 *
 * Free plan: 300 emails/day, no domain verification needed.
 */
require('dotenv').config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.SMTP_USER || 'abhir2756@gmail.com';

if (!BREVO_API_KEY) {
  console.warn('⚠️ BREVO_API_KEY not found — email sending will fail');
} else {
  console.log('✅ Brevo email service initialized');
}

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

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'CampusPrint', email: SENDER_EMAIL },
      to: [{ email }],
      subject: subjects[purpose] || subjects.verification,
      htmlContent: html,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Brevo API error:', JSON.stringify(result));
    throw new Error(result.message || 'Email delivery failed');
  }

  console.log(`📧 OTP email sent to ${email} (messageId: ${result.messageId})`);
};

module.exports = { sendOTP };
