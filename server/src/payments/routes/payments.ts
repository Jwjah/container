import { Router } from 'express';
import { PaymentController } from '../interfaces/controllers/PaymentController';
import { PaymentService } from '../application/services/PaymentService';
import { SqlPaymentRepository } from '../infrastructure/persistence/SqlPaymentRepository';
import { SqlOutboxRepository } from '../infrastructure/persistence/SqlOutboxRepository';
import { SqlOrderRepository } from '../infrastructure/persistence/SqlOrderRepository';
import { SqlInvoiceRepository } from '../infrastructure/persistence/SqlInvoiceRepository';
import { SqlPrintJobRepository } from '../infrastructure/persistence/SqlPrintJobRepository';
import { RazorpayGateway } from '../infrastructure/gateways/RazorpayGateway';
import { EventDispatcher } from '../application/events/EventDispatcher';
import { OutboxWorker } from '../application/events/OutboxWorker';
import { OrderFinalizationService } from '../application/services/OrderFinalizationService';
import { InvoiceNumberGenerator } from '../application/services/InvoiceNumberGenerator';

// Import CJS auth middleware using standard import
const { authenticate } = require('../../middleware/auth');

const router = Router();

// ── Shared Infrastructure ──────────────────────────────────────────────────
// Singleton EventDispatcher — shared across all domain module bootstrappers
const dispatcher = new EventDispatcher();

// ── Repository Instances ────────────────────────────────────────────────────
const paymentRepository = new SqlPaymentRepository();
const outboxRepository  = new SqlOutboxRepository();
const orderRepository   = new SqlOrderRepository();
const invoiceRepository = new SqlInvoiceRepository();
const printJobRepository = new SqlPrintJobRepository();
const paymentGateway    = new RazorpayGateway();

// ── Application Services ────────────────────────────────────────────────────
const invoiceNumberGenerator   = new InvoiceNumberGenerator();
const paymentService           = new PaymentService(paymentRepository, paymentGateway);
const orderFinalizationService = new OrderFinalizationService(
  paymentRepository,
  orderRepository,
  invoiceRepository,
  printJobRepository,
  outboxRepository
);

// ── Controller ──────────────────────────────────────────────────────────────
const paymentController = new PaymentController(paymentService, orderFinalizationService);

// ── Outbox Worker ───────────────────────────────────────────────────────────
// Drives event-driven architecture for all downstream bounded contexts
const outboxWorker = new OutboxWorker(outboxRepository, dispatcher);
outboxWorker.start();

// ── Routes ──────────────────────────────────────────────────────────────────
router.post('/',        authenticate, paymentController.initiate);
router.post('/verify',  authenticate, paymentController.verify);
router.post('/webhook',               paymentController.webhook);

export { dispatcher, outboxWorker };
export default router;
