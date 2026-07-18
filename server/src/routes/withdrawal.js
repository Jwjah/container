const express = require('express');
const router = express.Router();
const withdrawal = require('../controllers/withdrawalController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/payout-details', authenticate, authorize('shop', 'agent', 'admin'), withdrawal.getPayoutDetails);
router.post('/payout-details', authenticate, authorize('shop', 'agent', 'admin'), withdrawal.savePayoutDetails);
router.post('/request', authenticate, authorize('shop', 'agent', 'admin'), withdrawal.requestWithdrawal);
router.get('/history', authenticate, authorize('shop', 'agent', 'admin'), withdrawal.getHistory);

module.exports = router;
