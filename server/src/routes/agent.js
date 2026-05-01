const express = require('express');
const router = express.Router();
const agent = require('../controllers/agentController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/available', authenticate, authorize('agent'), agent.getAvailableDeliveries);
router.post('/accept/:orderId', authenticate, authorize('agent'), agent.acceptDelivery);
router.get('/missions', authenticate, authorize('agent'), agent.getActiveMissions);
router.post('/missions/:orderId/drop', authenticate, authorize('agent'), agent.dropDelivery);
router.post('/verify-pickup', authenticate, authorize('agent'), agent.verifyPickup);
router.post('/verify-delivery', authenticate, authorize('agent'), agent.verifyDelivery);
router.get('/earnings', authenticate, authorize('agent'), agent.getEarnings);

module.exports = router;
