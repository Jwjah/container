const express = require('express');
const router = express.Router();
const shops = require('../controllers/shopController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', shops.getShops);
router.post('/', authenticate, authorize('shop', 'admin', 'student'), shops.createShop);
router.get('/my', authenticate, authorize('shop', 'admin', 'student'), shops.getMyShop);
router.patch('/toggle', authenticate, authorize('shop', 'admin', 'student'), shops.toggleShop);
router.patch('/pricing', authenticate, authorize('shop', 'admin', 'student'), shops.updatePricing);
router.get('/:id/stats', authenticate, authorize('shop', 'admin', 'student'), shops.getShopStats);
router.put('/:id', authenticate, authorize('shop', 'admin', 'student'), shops.updateShop);

module.exports = router;
