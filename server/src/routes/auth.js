const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', auth.register);
router.post('/verify-otp', auth.verifyOTP);
router.post('/login', auth.login);
router.post('/resend-otp', auth.resendOTP);
router.get('/me', authenticate, auth.getMe);
router.put('/me', authenticate, auth.updateMe);
router.get('/transactions', authenticate, auth.getTransactions);

module.exports = router;
