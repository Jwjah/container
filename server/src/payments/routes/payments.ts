import { Router } from 'express';
import { PaymentController } from '../interfaces/controllers/PaymentController';
import { PaymentService } from '../application/services/PaymentService';
import { SqlPaymentRepository } from '../infrastructure/persistence/SqlPaymentRepository';
import { RazorpayGateway } from '../infrastructure/gateways/RazorpayGateway';

// Import CJS auth middleware using standard import
const { authenticate } = require('../../middleware/auth');

const router = Router();

// Manual Dependency Injection
const paymentRepository = new SqlPaymentRepository();
const paymentGateway = new RazorpayGateway();
const paymentService = new PaymentService(paymentRepository, paymentGateway);
const paymentController = new PaymentController(paymentService);

// Initiate payment (requires authentication)
router.post('/', authenticate, paymentController.initiate);

export default router;
