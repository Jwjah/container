const { sendOTP } = require('./src/services/emailService');
require('dotenv').config();

async function test() {
  try {
    console.log('Testing email send...');
    await sendOTP('test@example.com', '123456', 'register');
    console.log('Email sent successfully!');
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

test();
