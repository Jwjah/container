const express = require('express');
const router = express.Router();
const orders = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/', authenticate, authorize('student', 'admin', 'shop'), upload.array('files', 10), orders.createOrder);
router.get('/', authenticate, orders.getOrders);
router.get('/:id', authenticate, orders.getOrder);
router.get('/files/:fileId/download', authenticate, orders.downloadFile);
router.patch('/:id/status', authenticate, authorize('shop', 'admin', 'student'), orders.updateOrderStatus);
router.post('/:id/verify-pickup', authenticate, authorize('student', 'admin'), orders.verifyPickupByStudent);
router.post('/:id/verify-delivery', authenticate, authorize('student', 'admin'), orders.verifyDeliveryByStudent);
router.patch('/:id/change-fulfillment', authenticate, authorize('student', 'admin'), orders.changeFulfillment);
router.get('/files/:fileId/print-pdf', authenticate, authorize('shop', 'admin'), orders.downloadPrintPdf);

module.exports = router;
