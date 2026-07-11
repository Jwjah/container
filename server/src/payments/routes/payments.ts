import { Router } from 'express';
import { PaymentController } from '../interfaces/controllers/PaymentController';
import { PaymentService } from '../application/services/PaymentService';
import { OrderFinalizationService } from '../application/services/OrderFinalizationService';
import { SqlPaymentRepository } from '../infrastructure/persistence/SqlPaymentRepository';
import { SqlWebhookEventRepository } from '../infrastructure/persistence/SqlWebhookEventRepository';
import { SqlOrderRepository } from '../infrastructure/persistence/SqlOrderRepository';
import { SqlInvoiceRepository } from '../infrastructure/persistence/SqlInvoiceRepository';
import { SqlPrintJobRepository } from '../infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from '../infrastructure/persistence/SqlOutboxRepository';
import { RazorpayGateway } from '../infrastructure/gateways/RazorpayGateway';
import { EventDispatcher } from '../application/events/EventDispatcher';
import { NotificationConsumer } from '../application/events/NotificationConsumer';
import { OutboxWorker } from '../application/events/OutboxWorker';

// Import CJS auth middleware using standard import
const { authenticate } = require('../../middleware/auth');

const router = Router();

// Manual Dependency Injection
const paymentRepository = new SqlPaymentRepository();
const webhookEventRepository = new SqlWebhookEventRepository();
const paymentGateway = new RazorpayGateway();
const paymentService = new PaymentService(paymentRepository, paymentGateway, webhookEventRepository);

const orderRepository = new SqlOrderRepository();
const invoiceRepository = new SqlInvoiceRepository();
const printJobRepository = new SqlPrintJobRepository();
const outboxRepository = new SqlOutboxRepository();

const finalizationService = new OrderFinalizationService(
  paymentRepository,
  orderRepository,
  invoiceRepository,
  printJobRepository,
  outboxRepository
);

// Event Dispatcher and background worker setup
const dispatcher = new EventDispatcher();
const notificationConsumer = new NotificationConsumer();
dispatcher.register('ORDER_FINALIZED', (payload) => notificationConsumer.handleOrderFinalized(payload));

const outboxWorker = new OutboxWorker(outboxRepository, dispatcher);
outboxWorker.start();

const paymentController = new PaymentController(paymentService, finalizationService);

// Initiate payment (requires authentication)
router.post('/', authenticate, paymentController.initiate);

// Verify payment (requires authentication)
router.post('/verify', authenticate, paymentController.verify);

// Webhook endpoint (public, signature verified inside service)
router.post('/webhook', paymentController.webhook);

export default router;
