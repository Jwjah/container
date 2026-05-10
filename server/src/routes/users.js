const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.patch('/profile', authenticate, auth.updateProfile);

module.exports = router;
