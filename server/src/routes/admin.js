const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const withdrawal = require('../controllers/withdrawalController');
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

// Withdrawal management endpoints
router.get('/withdrawals/reconciliation', authenticate, authorize('admin'), withdrawal.exportReconciliation);
router.get('/withdrawals/summary', authenticate, authorize('admin'), withdrawal.getAdminWithdrawalsSummary);
router.get('/withdrawals', authenticate, authorize('admin'), withdrawal.getAdminWithdrawals);
router.post('/withdrawals/:id/approve', authenticate, authorize('admin'), withdrawal.approveWithdrawal);
router.post('/withdrawals/:id/reject', authenticate, authorize('admin'), withdrawal.rejectWithdrawal);
router.post('/withdrawals/:id/complete', authenticate, authorize('admin'), withdrawal.completeWithdrawal);

// Notifications (shared by all roles)
router.get('/notifications', authenticate, admin.getNotifications);
router.patch('/notifications/read', authenticate, admin.markRead);

module.exports = router;
