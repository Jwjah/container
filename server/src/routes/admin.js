const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/stats', authenticate, authorize('admin'), admin.getStats);
router.get('/users', authenticate, authorize('admin'), admin.getUsers);
router.patch('/users/:id/suspend', authenticate, authorize('admin'), admin.toggleSuspend);
router.patch('/shops/:id/toggle-approval', authenticate, authorize('admin'), admin.toggleShopApproval);
router.get('/shops/pending', authenticate, authorize('admin'), admin.getPendingShops);
router.patch('/shops/:id/approve', authenticate, authorize('admin'), admin.approveShop);
router.get('/orders', authenticate, authorize('admin'), admin.getOrders);
router.patch('/orders/:id/cancel', authenticate, authorize('admin'), admin.cancelOrder);
router.get('/export/orders', authenticate, authorize('admin'), admin.exportOrders);
router.delete('/danger', authenticate, authorize('admin'), admin.wipeOperations);
// Notifications (shared by all roles)
router.get('/notifications', authenticate, admin.getNotifications);
router.patch('/notifications/read', authenticate, admin.markRead);

module.exports = router;
