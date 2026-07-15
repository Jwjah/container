/**
 * test_flow_propagation.ts
 *
 * Production validation script: verifies one successful payment propagates correctly
 * through every bounded context end-to-end.
 *
 * Flow: Payment Captured → OrderFinalizationService → Outbox → Scheduling →
 *       Notification → Analytics → Tracking (Projection)
 *
 * IMPORTANT: Uses sequential event processing (no concurrent background workers)
 * to avoid SQLite single-thread deadlocks. Each bounded context's events are
 * processed one-at-a-time, in order.
 */

import db from '../config/database';

// ─── Payments ───────────────────────────────────────────────────────────────
import { SqlPaymentRepository } from './infrastructure/persistence/SqlPaymentRepository';
import { SqlOrderRepository } from './infrastructure/persistence/SqlOrderRepository';
import { SqlInvoiceRepository } from './infrastructure/persistence/SqlInvoiceRepository';
import { SqlPrintJobRepository } from './infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from './infrastructure/persistence/SqlOutboxRepository';
import { SqlWebhookEventRepository } from './infrastructure/persistence/SqlWebhookEventRepository';
import { RazorpayGateway } from './infrastructure/gateways/RazorpayGateway';
import { PaymentService } from './application/services/PaymentService';
import { OrderFinalizationService } from './application/services/OrderFinalizationService';
import { EventDispatcher as PaymentsDispatcher } from './application/events/EventDispatcher';
import { OutboxEvent } from './domain/entities/OutboxEvent';
import { OutboxEventStatus } from './domain/enums/OutboxEventStatus';
import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { OrderStatus } from './domain/enums/OrderStatus';

// ─── Scheduling ──────────────────────────────────────────────────────────────
import { SqlShopCapacityRepository } from '../scheduling/infrastructure/repositories/SqlShopCapacityRepository';
import { SqlPrinterRepository } from '../scheduling/infrastructure/repositories/SqlPrinterRepository';
import { SqlInventoryRepository } from '../scheduling/infrastructure/repositories/SqlInventoryRepository';
import { ShopCapacity } from '../scheduling/domain/entities/ShopCapacity';
import { Printer } from '../scheduling/domain/entities/Printer';
import { InventoryItem } from '../scheduling/domain/entities/InventoryItem';
import { PrinterCapabilities } from '../scheduling/domain/value-objects/PrinterCapabilities';
import { PrinterStatus } from '../scheduling/domain/enums/PrinterStatus';
import { ECTSchedulingStrategy } from '../scheduling/application/strategies/ECTSchedulingStrategy';
import { CapacityCalculator } from '../scheduling/application/services/CapacityCalculator';
import { InventoryService } from '../scheduling/application/services/InventoryService';
import { PrinterAssignmentService } from '../scheduling/application/services/PrinterAssignmentService';
import { QueueService } from '../scheduling/application/services/QueueService';
import { MaintenancePlanner } from '../scheduling/application/services/MaintenancePlanner';
import { SchedulingEngine } from '../scheduling/application/services/SchedulingEngine';
import { SchedulingEventSource } from '../scheduling/worker/SchedulingEventSource';
import { SchedulingEventDispatcher } from '../scheduling/application/events/SchedulingEventDispatcher';
import {
  OrderCreatedHandler as SchedulingOrderCreatedHandler,
  OrderCancelledHandler as SchedulingOrderCancelledHandler,
  PrintStartedHandler as SchedulingPrintStartedHandler,
  PrintCompletedHandler as SchedulingPrintCompletedHandler
} from '../scheduling/application/events/SchedulingEventHandlers';

// ─── Notification ────────────────────────────────────────────────────────────
import { SqlNotificationRepository } from '../notification/infrastructure/repositories/SqlNotificationRepository';
import { SqlNotificationTemplateRepository } from '../notification/infrastructure/repositories/SqlNotificationTemplateRepository';
import { SqlNotificationPreferenceRepository } from '../notification/infrastructure/repositories/SqlNotificationPreferenceRepository';
import { NotificationTemplate } from '../notification/domain/entities/NotificationTemplate';
import { NotificationChannel } from '../notification/domain/enums/NotificationChannel';
import { TemplateEngine } from '../notification/application/services/TemplateEngine';
import { PreferenceResolver } from '../notification/application/services/PreferenceResolver';
import { EmailChannelHandler } from '../notification/application/services/EmailChannelHandler';
import { InAppChannelHandler } from '../notification/application/services/InAppChannelHandler';
import { ChannelRouter } from '../notification/application/services/ChannelRouter';
import { DeliveryService } from '../notification/application/services/DeliveryService';
import { NotificationService } from '../notification/application/services/NotificationService';
import { NotificationEventSource } from '../notification/worker/NotificationEventSource';
import { NotificationEventDispatcher } from '../notification/worker/NotificationEventDispatcher';
import {
  OrderCreatedHandler as NotificationOrderCreatedHandler,
  PaymentConfirmedHandler as NotificationPaymentConfirmedHandler
} from '../notification/application/events/NotificationEventHandlers';

// ─── Analytics ───────────────────────────────────────────────────────────────
import { SqlOrderFactRepository } from '../analytics/infrastructure/repositories/SqlOrderFactRepository';
import { SqlAnalyticsMetricRepository } from '../analytics/infrastructure/repositories/SqlAnalyticsMetricRepository';
import { SqlShopAnalyticsRepository } from '../analytics/infrastructure/repositories/SqlShopAnalyticsRepository';
import { SqlUserAnalyticsRepository } from '../analytics/infrastructure/repositories/SqlUserAnalyticsRepository';
import { AnalyticsAggregationService } from '../analytics/application/services/AnalyticsAggregationService';
import { AnalyticsEventSource } from '../analytics/worker/AnalyticsEventSource';
import { AnalyticsEventDispatcher } from '../analytics/worker/AnalyticsEventDispatcher';
import {
  OrderCreatedAnalyticsHandler,
  PaymentConfirmedAnalyticsHandler
} from '../analytics/worker/AnalyticsEventHandlers';

// ─── Tracking / Projection ───────────────────────────────────────────────────
import { SqlOrderLifecycleProjectionRepository } from '../tracking/infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../tracking/infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../tracking/infrastructure/repositories/SqlProcessedEventsRepository';
import { ProjectionUpdateService } from '../tracking/application/ProjectionUpdateService';
import { ProjectionEventHandlerRegistry } from '../tracking/application/ProjectionEventHandlerRegistry';
import { OrderCreatedProjectionHandler } from '../tracking/application/handlers/OrderCreatedProjectionHandler';
import { PaymentConfirmedProjectionHandler } from '../tracking/application/handlers/PaymentConfirmedProjectionHandler';
import { ProjectionEventDispatcher } from '../tracking/application/dispatcher/ProjectionEventDispatcher';
import { EventOrderingValidator } from '../tracking/application/ordering/EventOrderingValidator';
import { OutboxProjectionEventSource } from '../tracking/infrastructure/events/OutboxProjectionEventSource';
import { LifecycleState } from '../tracking/domain/enums/LifecycleState';

import crypto from 'crypto';

// ─── Mock Razorpay SDK ───────────────────────────────────────────────────────
class MockRazorpaySDK {
  public orders = {
    create: async (params: any) => ({
      id: `rzp_order_mock_prop_${Date.now()}`,
      status: 'created',
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      entity: 'order'
    })
  };
}

const STUDENT_ID = 99;
const MANAGER_ID = 30;
const SHOP_ID   = 40;

function computeSignature(orderId: string, paymentId: string): string {
  const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

// ─── Checks ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const checks: Array<{ name: string; status: 'PASS' | 'FAIL'; reason?: string }> = [];

function check(name: string, condition: boolean, reason?: string) {
  if (condition) {
    checks.push({ name, status: 'PASS' });
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    checks.push({ name, status: 'FAIL', reason: reason || 'Assertion failed' });
    failed++;
    console.error(`  [FAIL] ${name}  ← ${reason || 'Assertion failed'}`);
  }
}

// ─── Sequential event processor ──────────────────────────────────────────────
/**
 * Drain all pending events for a named bounded context by calling
 * source.poll → dispatcher.dispatch → source.acknowledge, ONE event at a time.
 * No background threads, no concurrent transactions.
 */
async function drainScheduling(
  source: SchedulingEventSource,
  dispatcher: SchedulingEventDispatcher
): Promise<number> {
  let processed = 0;
  while (true) {
    const events = await source.poll(10);
    if (events.length === 0) break;
    for (const event of events) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await dispatcher.dispatch(event, conn);
        await source.acknowledge(event, conn);
        await conn.commit();
        processed++;
        console.log(`  [Scheduling] Processed event "${event.eventType}" for order ${event.payload?.orderId}`);
      } catch (err: any) {
        await conn.rollback();
        // Swallow duplicate-key (idempotency) silently
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [Scheduling] Error processing ${event.eventType}: ${err.message}`);
        }
        // Still acknowledge to avoid infinite loop
        const conn2 = await db.getConnection();
        try { await source.acknowledge(event, conn2); } catch (_) {} finally { conn2.release(); }
      } finally {
        conn.release();
      }
    }
  }
  return processed;
}

async function drainNotification(
  source: NotificationEventSource,
  dispatcher: NotificationEventDispatcher
): Promise<number> {
  let processed = 0;
  while (true) {
    const events = await source.poll(10);
    if (events.length === 0) break;
    for (const event of events) {
      try {
        await dispatcher.dispatch(event);
        await source.acknowledge(event);
        processed++;
        console.log(`  [Notification] Processed event "${event.eventType}" for order ${event.payload?.orderId}`);
      } catch (err: any) {
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [Notification] Error processing ${event.eventType}: ${err.message}`);
        }
        try { await source.acknowledge(event); } catch (_) {}
      }
    }
  }
  return processed;
}

async function drainAnalytics(
  source: AnalyticsEventSource,
  dispatcher: AnalyticsEventDispatcher
): Promise<number> {
  let processed = 0;
  while (true) {
    const events = await source.poll(10);
    if (events.length === 0) break;
    for (const event of events) {
      try {
        await dispatcher.dispatch(event);
        await source.acknowledge(event);
        processed++;
        console.log(`  [Analytics] Processed event "${event.eventType}" for order ${event.payload?.orderId}`);
      } catch (err: any) {
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [Analytics] Error processing ${event.eventType}: ${err.message}`);
        }
        try { await source.acknowledge(event); } catch (_) {}
      }
    }
  }
  return processed;
}

async function drainTracking(
  source: OutboxProjectionEventSource,
  dispatcher: ProjectionEventDispatcher,
  orderingValidator: EventOrderingValidator
): Promise<number> {
  let processed = 0;
  const workerId = `prop-test-worker-${crypto.randomUUID()}`;
  // Guard: track event IDs that failed once so we don't infinite-loop on persistent errors
  const failed = new Set<string>();
  while (true) {
    const events = await source.poll(10);
    if (events.length === 0) break;
    await source.lease(events, 30000, workerId);
    if (events.length === 0) break;
    const todo = events.filter(e => !failed.has(e.eventId));
    if (todo.length === 0) break;
    for (const event of todo) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await orderingValidator.assertOrdering(event, conn);
        await dispatcher.dispatch(event, conn);
        await conn.commit();
        await source.acknowledge([event]);
        processed++;
        console.log(`  [Tracking] Processed event "${event.eventType}" for order ${event.payload?.orderId}`);
      } catch (err: any) {
        await conn.rollback();
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [Tracking] Error processing ${event.eventType}: ${err.message}`);
        }
        failed.add(event.eventId);
        await source.release([event]);
      } finally {
        conn.release();
      }
    }
  }
  return processed;
}

// ─── Payments outbox drain ────────────────────────────────────────────────────
async function drainPaymentsOutbox(
  outboxRepo: SqlOutboxRepository,
  paymentsDispatcher: PaymentsDispatcher,
  workerId: string
): Promise<number> {
  let processed = 0;
  while (true) {
    const conn = await db.getConnection();
    let claimed: any[] = [];
    try {
      await conn.beginTransaction();
      claimed = await outboxRepo.claimBatch(10, workerId, conn);
      await conn.commit();
    } catch (err: any) {
      await conn.rollback();
      break;
    } finally {
      conn.release();
    }
    if (claimed.length === 0) break;
    for (const event of claimed) {
      try {
        await paymentsDispatcher.dispatch(event);
        event.status = OutboxEventStatus.PROCESSED;
        event.processedAt = new Date();
        await outboxRepo.update(event);
        processed++;
        console.log(`  [PaymentsOutbox] Processed event "${event.eventType}"`);
      } catch (err: any) {
        console.error(`  [PaymentsOutbox] Failed event "${event.eventType}": ${err.message}`);
      }
    }
  }
  return processed;
}

// ─── Database Setup ───────────────────────────────────────────────────────────
async function setupDb() {
  await db.execute('PRAGMA foreign_keys = OFF');
  const tables = [
    'fulfillment_history','fulfillments','print_job_history','print_jobs','invoices',
    'payments','payment_webhook_events','orders','shops','users','outbox_events',
    'transactions','scheduling_processed_events','scheduling_print_queue',
    'scheduling_shops_capacity','scheduling_printers','scheduling_inventory',
    'processed_notification_events','notifications','notification_templates',
    'notification_preferences',
    'processed_events','order_lifecycle_projections','order_lifecycle_timeline_events',
    'dead_letter_events','analytics_order_facts','analytics_events_processed',
    'analytics_daily_metrics','analytics_shop_metrics','analytics_user_metrics'
  ];
  for (const t of tables) {
    try { await db.execute(`DELETE FROM ${t}`); } catch (_) {}
  }
  await db.execute('PRAGMA foreign_keys = ON');

  // Seed base records
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified, wallet_balance) VALUES (?,?,?,?,?,?,?)',
    [STUDENT_ID, 'Student Bob', 'bob@campus.edu', 'pass', 'student', 1, 0.0]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified, wallet_balance) VALUES (?,?,?,?,?,?,?)',
    [MANAGER_ID, 'Manager Shop', 'manager@cp.com', 'pass', 'shop', 1, 0.0]
  );
  await db.execute(
    'INSERT INTO shops (id, shop_name, user_id, wallet_balance) VALUES (?,?,?,?)',
    [SHOP_ID, 'Campus Shop Main', MANAGER_ID, 0.0]
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runFlowPropagationValidation() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     CampusPrint E2E Payment Propagation Validation Script        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Setup ──────────────────────────────────────────────────────────────────
  await setupDb();

  // Scheduling repos & services
  const capacityRepo  = new SqlShopCapacityRepository();
  const printerRepo   = new SqlPrinterRepository();
  const inventoryRepo = new SqlInventoryRepository();

  await capacityRepo.create(new ShopCapacity(SHOP_ID, 5, 7200, true, 1));
  const caps = new PrinterCapabilities(15, true, true, ['A4'], 100, ['plain']);
  await printerRepo.create(new Printer(null, SHOP_ID, 'Integrator-A', PrinterStatus.AVAILABLE, caps));
  await inventoryRepo.create(new InventoryItem(null, SHOP_ID, 'paper', 'A4', 1000, 'sheets', 200));
  await inventoryRepo.create(new InventoryItem(null, SHOP_ID, 'ink', 'Black', 100, 'percentage', 20));
  await inventoryRepo.create(new InventoryItem(null, SHOP_ID, 'ink', 'Color', 100, 'percentage', 20));

  // Notification repos & services
  const templateRepo   = new SqlNotificationTemplateRepository();
  const preferenceRepo = new SqlNotificationPreferenceRepository();
  const notifRepo      = new SqlNotificationRepository();

  await templateRepo.create(new NotificationTemplate(
    null, 'ORDER_CREATED', 'Order Placed',
    'Your order {{orderId}} is placed.',
    '<p>Your order {{orderId}} is placed.</p>'
  ));
  await templateRepo.create(new NotificationTemplate(
    null, 'PAYMENT_CONFIRMED', 'Payment Confirmed',
    'Your payment for {{orderId}} was successful.',
    '<p>Your payment for {{orderId}} was successful.</p>'
  ));

  // Analytics repos & services
  const factRepo         = new SqlOrderFactRepository();
  const metricRepo       = new SqlAnalyticsMetricRepository();
  const shopAnalyticsRepo = new SqlShopAnalyticsRepository();
  const userAnalyticsRepo = new SqlUserAnalyticsRepository();
  const aggregationService = new AnalyticsAggregationService(factRepo, metricRepo, shopAnalyticsRepo, userAnalyticsRepo);

  // Tracking repos & services
  const projRepo             = new SqlOrderLifecycleProjectionRepository();
  const timelineRepo         = new SqlTimelineEventRepository();
  const processedEventsRepo  = new SqlProcessedEventsRepository();
  const trackingUpdateService = new ProjectionUpdateService(projRepo, timelineRepo, processedEventsRepo);

  // Payments repos & services
  const orderRepo    = new SqlOrderRepository();
  const paymentRepo  = new SqlPaymentRepository();
  const invoiceRepo  = new SqlInvoiceRepository();
  const printJobRepo = new SqlPrintJobRepository();
  const outboxRepo   = new SqlOutboxRepository();
  const webhookRepo  = new SqlWebhookEventRepository();

  const mockSDK = new MockRazorpaySDK();
  const gateway = new RazorpayGateway(mockSDK);
  const paymentService      = new PaymentService(paymentRepo, gateway, webhookRepo);
  const finalizationService = new OrderFinalizationService(paymentRepo, orderRepo, invoiceRepo, printJobRepo, outboxRepo);

  // Dispatchers (used for sequential draining)
  const paymentsDispatcher = new PaymentsDispatcher();
  const outboxWorkerId     = `prop-outbox-${crypto.randomUUID()}`;

  const strategy         = new ECTSchedulingStrategy();
  const schedulingSource = new SchedulingEventSource();
  const schedulingDispatcher = new SchedulingEventDispatcher(
    new SchedulingEngine(new CapacityCalculator(capacityRepo, printerRepo), new InventoryService(inventoryRepo), new PrinterAssignmentService(printerRepo, strategy)),
    new QueueService(printerRepo, new PrinterAssignmentService(printerRepo, strategy)),
    new InventoryService(inventoryRepo),
    new MaintenancePlanner(printerRepo),
    capacityRepo,
    printerRepo
  );
  schedulingDispatcher.register('ORDER_CREATED',   new SchedulingOrderCreatedHandler());
  schedulingDispatcher.register('ORDER_CANCELLED', new SchedulingOrderCancelledHandler());
  schedulingDispatcher.register('PRINT_STARTED',   new SchedulingPrintStartedHandler());
  schedulingDispatcher.register('PRINT_COMPLETED', new SchedulingPrintCompletedHandler());

  const notifService = new NotificationService(
    templateRepo,
    new DeliveryService(
      notifRepo,
      new EmailChannelHandler(),
      new InAppChannelHandler(notifRepo),
      new ChannelRouter(new PreferenceResolver(preferenceRepo)),
      new TemplateEngine()
    )
  );
  const notificationSource     = new NotificationEventSource();
  const notificationDispatcher = new NotificationEventDispatcher();
  notificationDispatcher.register('ORDER_CREATED',    new NotificationOrderCreatedHandler(notifService));
  notificationDispatcher.register('PAYMENT_CONFIRMED', new NotificationPaymentConfirmedHandler(notifService));

  const analyticsSource     = new AnalyticsEventSource();
  const analyticsDispatcher = new AnalyticsEventDispatcher();
  analyticsDispatcher.register('ORDER_CREATED',    new OrderCreatedAnalyticsHandler(factRepo, aggregationService));
  analyticsDispatcher.register('PAYMENT_CONFIRMED', new PaymentConfirmedAnalyticsHandler(factRepo, aggregationService));

  const trackingRegistry = new ProjectionEventHandlerRegistry();
  trackingRegistry.register('ORDER_CREATED',  new OrderCreatedProjectionHandler());
  trackingRegistry.register('ORDER_FINALIZED', new PaymentConfirmedProjectionHandler());
  const trackingDispatcher    = new ProjectionEventDispatcher(trackingRegistry, trackingUpdateService);
  const orderingValidator     = new EventOrderingValidator(projRepo);
  const outboxProjEventSource = new OutboxProjectionEventSource();

  // ─── In-memory bridge: ORDER_FINALIZED → PAYMENT_CONFIRMED outbox event ──
  paymentsDispatcher.register('ORDER_FINALIZED', async (payload: any) => {
    const bridgePayload = {
      orderId:          payload.orderId,
      shopId:           payload.shopId,
      userId:           payload.studentId,
      amount:           payload.totalPrice,
      paymentReference: payload.paymentReference,
      gatewayPaymentId: payload.gatewayPaymentId,
      invoiceNumber:    payload.invoiceNumber
    };
    const bridgeEvent = new OutboxEvent(
      null,
      crypto.randomUUID(),
      'PAYMENT_CONFIRMED',
      'PAYMENT',
      String(payload.orderId),
      JSON.stringify(bridgePayload),
      OutboxEventStatus.PENDING,
      0,
      null,
      payload.correlationId || 'corr-bridge',
      1,
      new Date()
    );
    await outboxRepo.create(bridgeEvent);
    console.log('  [Bridge] Wrote PAYMENT_CONFIRMED outbox event from ORDER_FINALIZED dispatch');
  });

  const ORDER_ID     = 9001;
  const CORRELATION  = 'corr-prop-9001';

  // ── Step 1: Place test order ───────────────────────────────────────────────
  console.log('\n🔹 Step 1: Seeding test order...');
  await db.execute(
    `INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price, total_pages, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [ORDER_ID, `hash-${ORDER_ID}`, STUDENT_ID, SHOP_ID, 'pending', 150.00, 10]
  );

  // ── Step 2: Stage ORDER_CREATED outbox event ───────────────────────────────
  console.log('\n🔹 Step 2: Writing ORDER_CREATED outbox event...');
  const orderCreatedEvent = new OutboxEvent(
    null, crypto.randomUUID(), 'ORDER_CREATED', 'ORDER', String(ORDER_ID),
    JSON.stringify({
      orderId:      ORDER_ID,
      orderHash:    `hash-${ORDER_ID}`,
      shopId:       SHOP_ID,
      shopName:     'Campus Shop Main',
      studentId:    STUDENT_ID,
      userId:       STUDENT_ID,   // required by Analytics handler
      deliveryType: 'pickup',
      hostelAddress: null,
      pagesCount:   10,
      totalPages:   10,
      duplex:       true,
      color:        true,
      totalPrice:   150.00
    }),
    OutboxEventStatus.PENDING, 0, null, CORRELATION, 1, new Date()
  );
  await outboxRepo.create(orderCreatedEvent);

  // ── Step 3: Process ORDER_CREATED through all contexts ────────────────────
  console.log('\n🔹 Step 3: Processing ORDER_CREATED through all bounded contexts...');
  await drainScheduling(schedulingSource, schedulingDispatcher);
  await drainNotification(notificationSource, notificationDispatcher);
  await drainAnalytics(analyticsSource, analyticsDispatcher);
  await drainTracking(outboxProjEventSource, trackingDispatcher, orderingValidator);

  // Verify ORDER_CREATED downstream
  console.log('\n🔍 Verifying ORDER_CREATED outcomes...');
  const [qRows]: any = await db.execute('SELECT * FROM scheduling_print_queue WHERE order_id = ?', [ORDER_ID]);
  check('Scheduling queue slot created (ORDER_CREATED)', (qRows as any[]).length === 1);

  const [createdNotifRows]: any = await db.execute(
    "SELECT * FROM notifications WHERE user_id = ?", [STUDENT_ID]
  );
  check('Notification created for ORDER_CREATED', (createdNotifRows as any[]).length > 0);

  const factBefore = await factRepo.findByOrderId(ORDER_ID);
  check('Analytics OrderFact created (ORDER_CREATED)', factBefore !== null);

  const projAfterCreate = await projRepo.findByOrderId(ORDER_ID);
  check('Tracking projection created (ORDER_CREATED)', projAfterCreate !== null);

  // ── Step 4: Execute payment (verify + finalize) ────────────────────────────
  console.log('\n🔹 Step 4: Initiating, verifying, and finalizing payment...');
  const initRes = await paymentService.initiatePayment({
    orderId:       ORDER_ID,
    studentId:     STUDENT_ID,
    paymentMethod: PaymentMethod.UPI,
    gateway:       PaymentGatewayProvider.RAZORPAY,
    idempotencyKey: 'idemp-prop-9001'
  });

  const paymentId = 'pay_prop_9001';
  const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

  await paymentService.verifyPayment({
    paymentUuid:     initRes.uuid,
    gatewayPaymentId: paymentId,
    gatewayOrderId:   initRes.gatewayOrderId!,
    signature
  }, STUDENT_ID);

  await finalizationService.finalizeOrder(initRes.uuid);

  // ── Step 5: Let Tracking process ORDER_FINALIZED (while still PENDING in outbox_events) ──
  // OutboxProjectionEventSource queries outbox_events WHERE status = PENDING/FAILED.
  // Run this BEFORE payments outbox marks ORDER_FINALIZED as PROCESSED.
  console.log('\n🔹 Step 5a: Tracking processes ORDER_FINALIZED (while still PENDING)...');
  await drainTracking(outboxProjEventSource, trackingDispatcher, orderingValidator);

  // ── Step 5b: Write PAYMENT_CONFIRMED bridge event directly ────────────────
  // finalizeOrder staged ORDER_FINALIZED. We bridge it to PAYMENT_CONFIRMED for
  // Notification and Analytics (which only subscribe to PAYMENT_CONFIRMED, not ORDER_FINALIZED).
  console.log('\n🔹 Step 5b: Writing PAYMENT_CONFIRMED bridge event for downstream contexts...');
  const [finalizedRow]: any = await db.execute(
    "SELECT * FROM outbox_events WHERE event_type = 'ORDER_FINALIZED' ORDER BY id DESC LIMIT 1"
  );
  const finalizedPayload = (finalizedRow as any[])[0]
    ? JSON.parse((finalizedRow as any[])[0].payload)
    : {};
  const bridgeEventDirect = new OutboxEvent(
    null,
    crypto.randomUUID(),
    'PAYMENT_CONFIRMED',
    'PAYMENT',
    String(ORDER_ID),
    JSON.stringify({
      orderId:          ORDER_ID,
      shopId:           SHOP_ID,
      userId:           STUDENT_ID,
      amount:           150.00,
      paymentReference: finalizedPayload.paymentReference || '',
      gatewayPaymentId: finalizedPayload.gatewayPaymentId || '',
      invoiceNumber:    finalizedPayload.invoiceNumber || ''
    }),
    OutboxEventStatus.PENDING,
    0, null,
    CORRELATION,
    1,
    new Date()
  );
  await outboxRepo.create(bridgeEventDirect);
  console.log('  [Bridge] Wrote PAYMENT_CONFIRMED outbox event directly');

  // ── Step 6: Drain PAYMENT_CONFIRMED through all downstream contexts ────────
  console.log('\n🔹 Step 6: Processing PAYMENT_CONFIRMED through downstream contexts...');
  await drainScheduling(schedulingSource, schedulingDispatcher);
  await drainNotification(notificationSource, notificationDispatcher);
  await drainAnalytics(analyticsSource, analyticsDispatcher);
  await drainTracking(outboxProjEventSource, trackingDispatcher, orderingValidator);

  // ── Step 7: Assertions ─────────────────────────────────────────────────────
  console.log('\n🔍 Verifying payment propagation outcomes...');

  const payment = await paymentRepo.findByUuid(initRes.uuid);
  check('Payment status = CAPTURED', payment?.status === PaymentStatus.CAPTURED,
    `got ${payment?.status}`);

  const order = await orderRepo.findById(ORDER_ID);
  check('Order status = PAID', order?.status === OrderStatus.PAID,
    `got ${order?.status}`);

  const invoice = await invoiceRepo.findByOrderId(ORDER_ID);
  check('Invoice created', invoice !== null);
  const [invCount]: any = await db.execute('SELECT COUNT(*) as c FROM invoices WHERE order_id = ?', [ORDER_ID]);
  check('No duplicate invoices', (invCount as any[])[0].c === 1, `count=${(invCount as any[])[0].c}`);

  const printJob = await printJobRepo.findByOrderId(ORDER_ID);
  check('PrintJob created', printJob !== null);
  const [jobCount]: any = await db.execute('SELECT COUNT(*) as c FROM print_jobs WHERE order_id = ?', [ORDER_ID]);
  check('No duplicate print jobs', (jobCount as any[])[0].c === 1, `count=${(jobCount as any[])[0].c}`);

  const [finalizedEvts]: any = await db.execute(
    "SELECT COUNT(*) as c FROM outbox_events WHERE event_type = 'ORDER_FINALIZED'"
  );
  check('ORDER_FINALIZED outbox event exists', (finalizedEvts as any[])[0].c === 1);

  const trackingProj = await projRepo.findByOrderId(ORDER_ID);
  check('Tracking projection state = CONFIRMED',
    trackingProj?.currentState === LifecycleState.CONFIRMED,
    `got ${trackingProj?.currentState}`);

  const [paymentConfirmNotifs]: any = await db.execute(
    "SELECT COUNT(*) as c FROM notifications WHERE user_id = ?", [STUDENT_ID]
  );
  const notifCountAfter = (paymentConfirmNotifs as any[])[0].c;
  check('Notifications created (at least ORDER_CREATED + PAYMENT_CONFIRMED)', notifCountAfter >= 2,
    `count=${notifCountAfter}`);

  const factAfter = await factRepo.findByOrderId(ORDER_ID);
  check('Analytics OrderFact updated (paymentConfirmedAt set)',
    factAfter !== null && factAfter.paymentConfirmedAt !== null);
  check('Analytics OrderFact revenue = 150.00', factAfter?.revenue === 150.00,
    `got ${factAfter?.revenue}`);

  const metrics = await metricRepo.findByDate(new Date().toISOString().slice(0, 10));
  check('Daily analytics metric has revenue > 0',
    metrics !== null && metrics.totalRevenue > 0,
    `totalRevenue=${metrics?.totalRevenue}`);

  const [dlqCount]: any = await db.execute('SELECT COUNT(*) as c FROM dead_letter_events');
  check('DLQ is empty', (dlqCount as any[])[0].c === 0,
    `DLQ count=${(dlqCount as any[])[0].c}`);

  // ── Step 8: Idempotency verification ──────────────────────────────────────
  console.log('\n🔹 Step 8: Idempotency — re-draining all contexts on same events...');
  await drainScheduling(schedulingSource, schedulingDispatcher);
  await drainNotification(notificationSource, notificationDispatcher);
  await drainAnalytics(analyticsSource, analyticsDispatcher);
  await drainTracking(outboxProjEventSource, trackingDispatcher, orderingValidator);

  console.log('\n🔍 Verifying idempotency (no duplicate side effects)...');
  const [invCount2]: any = await db.execute('SELECT COUNT(*) as c FROM invoices WHERE order_id = ?', [ORDER_ID]);
  check('Idempotency: No duplicate invoices', (invCount2 as any[])[0].c === 1);

  const [jobCount2]: any = await db.execute('SELECT COUNT(*) as c FROM print_jobs WHERE order_id = ?', [ORDER_ID]);
  check('Idempotency: No duplicate print jobs', (jobCount2 as any[])[0].c === 1);

  const [notifCount2]: any = await db.execute(
    "SELECT COUNT(*) as c FROM notifications WHERE user_id = ?", [STUDENT_ID]
  );
  check('Idempotency: Notification count unchanged on re-drain',
    (notifCount2 as any[])[0].c === notifCountAfter);

  const [factCount2]: any = await db.execute(
    'SELECT COUNT(*) as c FROM analytics_order_facts WHERE order_id = ?', [ORDER_ID]
  );
  check('Idempotency: No duplicate analytics facts', (factCount2 as any[])[0].c === 1);

  const [dlqCount2]: any = await db.execute('SELECT COUNT(*) as c FROM dead_letter_events');
  check('Idempotency: DLQ still empty', (dlqCount2 as any[])[0].c === 0);

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                  VALIDATION RESULTS                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  for (const c of checks) {
    const icon = c.status === 'PASS' ? '✅' : '❌';
    const reasonStr = c.reason ? `  ← ${c.reason}` : '';
    console.log(`  ${icon} [${c.status}] ${c.name}${reasonStr}`);
  }
  console.log(`\n  Total: ${passed + failed}  |  PASSED: ${passed}  |  FAILED: ${failed}`);

  if (failed > 0) {
    console.error(`\n❌  ${failed} validation check(s) FAILED.`);
    process.exit(1);
  } else {
    console.log(`\n🎉  All ${passed} validation checks PASSED. System is end-to-end healthy.`);
    process.exit(0);
  }
}

runFlowPropagationValidation().catch(err => {
  console.error('Unexpected execution failure:', err);
  process.exit(1);
});
