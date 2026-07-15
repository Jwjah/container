/**
 * test_replay_validation.ts
 *
 * Production integration regression test: verifies the entire CampusPrint platform
 * can rebuild all projections from outbox_events using each bounded-context
 * ReplayService, and that a second replay is fully idempotent.
 *
 * Procedure:
 *  1. Seed completed orders with successful payments.
 *  2. Record a rich baseline: per-order lifecycle states, invoice numbers,
 *     total prices, payment statuses, notification titles, analytics revenue,
 *     plus DLQ / pending-outbox health counters.
 *  3. Wipe ONLY projection/read-model tables (preserve source-of-truth tables).
 *  4. Execute every ReplayService with reset=true.
 *  5. Wait for async replay workers to finish.
 *  6. Deep-compare rebuilt data against baseline:
 *       - Revenue unchanged
 *       - Per-order lifecycle states identical
 *       - Invoice numbers / prices / payment statuses preserved
 *       - Notification titles match
 *       - Analytics revenue per-order matches
 *       - No orphan timeline / analytics / scheduling rows
 *       - DLQ empty, no pending outbox events
 *  7. Run all ReplayServices a second time → assert full idempotency
 *     (no new rows, no duplicates, no data changes).
 *
 * This file is a PERMANENT integration regression test. Keep it passing for
 * every RFC that touches projections, replay, or read-model tables.
 */

import db from '../config/database';
import crypto from 'crypto';

// ─── Payments ────────────────────────────────────────────────────────────────
import { SqlPaymentRepository }     from './infrastructure/persistence/SqlPaymentRepository';
import { SqlOrderRepository }       from './infrastructure/persistence/SqlOrderRepository';
import { SqlInvoiceRepository }     from './infrastructure/persistence/SqlInvoiceRepository';
import { SqlPrintJobRepository }    from './infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository }      from './infrastructure/persistence/SqlOutboxRepository';
import { SqlWebhookEventRepository } from './infrastructure/persistence/SqlWebhookEventRepository';
import { RazorpayGateway }          from './infrastructure/gateways/RazorpayGateway';
import { PaymentService }           from './application/services/PaymentService';
import { OrderFinalizationService } from './application/services/OrderFinalizationService';
import { OutboxEvent }              from './domain/entities/OutboxEvent';
import { OutboxEventStatus }        from './domain/enums/OutboxEventStatus';
import { PaymentMethod }            from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider }   from './domain/enums/PaymentGatewayProvider';

// ─── Scheduling ───────────────────────────────────────────────────────────────
import { SqlShopCapacityRepository }  from '../scheduling/infrastructure/repositories/SqlShopCapacityRepository';
import { SqlPrinterRepository }       from '../scheduling/infrastructure/repositories/SqlPrinterRepository';
import { SqlInventoryRepository }     from '../scheduling/infrastructure/repositories/SqlInventoryRepository';
import { ShopCapacity }               from '../scheduling/domain/entities/ShopCapacity';
import { Printer }                    from '../scheduling/domain/entities/Printer';
import { InventoryItem }              from '../scheduling/domain/entities/InventoryItem';
import { PrinterCapabilities }        from '../scheduling/domain/value-objects/PrinterCapabilities';
import { PrinterStatus }              from '../scheduling/domain/enums/PrinterStatus';
import { ECTSchedulingStrategy }      from '../scheduling/application/strategies/ECTSchedulingStrategy';
import { CapacityCalculator }         from '../scheduling/application/services/CapacityCalculator';
import { InventoryService }           from '../scheduling/application/services/InventoryService';
import { PrinterAssignmentService }   from '../scheduling/application/services/PrinterAssignmentService';
import { QueueService }               from '../scheduling/application/services/QueueService';
import { MaintenancePlanner }         from '../scheduling/application/services/MaintenancePlanner';
import { SchedulingEngine }           from '../scheduling/application/services/SchedulingEngine';
import { SchedulingEventSource }      from '../scheduling/worker/SchedulingEventSource';
import { SchedulingEventDispatcher }  from '../scheduling/application/events/SchedulingEventDispatcher';
import { SchedulingEventWorker }      from '../scheduling/worker/SchedulingEventWorker';
import {
  OrderCreatedHandler  as SchedulingOrderCreatedHandler,
  OrderCancelledHandler as SchedulingOrderCancelledHandler,
  PrintStartedHandler  as SchedulingPrintStartedHandler,
  PrintCompletedHandler as SchedulingPrintCompletedHandler,
} from '../scheduling/application/events/SchedulingEventHandlers';
import { SchedulingReplayService }    from '../scheduling/application/replay/SchedulingReplayService';
import { SchedulingReplayWorker }     from '../scheduling/application/replay/SchedulingReplayWorker';
import { ReplayProgressTracker as SchedulingProgressTracker } from '../scheduling/application/replay/ReplayProgressTracker';
import { ReplayRepository as SchedulingReplayRepository }     from '../scheduling/infrastructure/replay/ReplayRepository';
import { SchedulingSnapshotService }  from '../scheduling/application/services/SchedulingSnapshotService';
import { SqlSchedulingSnapshotRepository } from '../scheduling/infrastructure/repositories/SqlSchedulingSnapshotRepository';

// ─── Notification ─────────────────────────────────────────────────────────────
import { SqlNotificationRepository }          from '../notification/infrastructure/repositories/SqlNotificationRepository';
import { SqlNotificationTemplateRepository }  from '../notification/infrastructure/repositories/SqlNotificationTemplateRepository';
import { SqlNotificationPreferenceRepository } from '../notification/infrastructure/repositories/SqlNotificationPreferenceRepository';
import { NotificationTemplate }               from '../notification/domain/entities/NotificationTemplate';
import { TemplateEngine }                     from '../notification/application/services/TemplateEngine';
import { PreferenceResolver }                 from '../notification/application/services/PreferenceResolver';
import { EmailChannelHandler }                from '../notification/application/services/EmailChannelHandler';
import { InAppChannelHandler }                from '../notification/application/services/InAppChannelHandler';
import { ChannelRouter }                      from '../notification/application/services/ChannelRouter';
import { DeliveryService }                    from '../notification/application/services/DeliveryService';
import { NotificationService }                from '../notification/application/services/NotificationService';
import { NotificationEventSource }            from '../notification/worker/NotificationEventSource';
import { NotificationEventDispatcher }        from '../notification/worker/NotificationEventDispatcher';
import { NotificationEventWorker }            from '../notification/worker/NotificationEventWorker';
import {
  OrderCreatedHandler   as NotifOrderCreatedHandler,
  PaymentConfirmedHandler as NotifPaymentConfirmedHandler,
} from '../notification/application/events/NotificationEventHandlers';
import { NotificationReplayService }  from '../notification/application/replay/NotificationReplayService';
import { NotificationReplayWorker }   from '../notification/application/replay/NotificationReplayWorker';
import { ReplayProgressTracker as NotifProgressTracker } from '../notification/application/replay/ReplayProgressTracker';

// ─── Analytics ────────────────────────────────────────────────────────────────
import { SqlOrderFactRepository }        from '../analytics/infrastructure/repositories/SqlOrderFactRepository';
import { SqlAnalyticsMetricRepository }  from '../analytics/infrastructure/repositories/SqlAnalyticsMetricRepository';
import { SqlShopAnalyticsRepository }    from '../analytics/infrastructure/repositories/SqlShopAnalyticsRepository';
import { SqlUserAnalyticsRepository }    from '../analytics/infrastructure/repositories/SqlUserAnalyticsRepository';
import { AnalyticsAggregationService }   from '../analytics/application/services/AnalyticsAggregationService';
import { AnalyticsEventSource }          from '../analytics/worker/AnalyticsEventSource';
import { AnalyticsEventDispatcher }      from '../analytics/worker/AnalyticsEventDispatcher';
import { AnalyticsWorker }               from '../analytics/worker/AnalyticsWorker';
import {
  OrderCreatedAnalyticsHandler,
  PaymentConfirmedAnalyticsHandler,
} from '../analytics/worker/AnalyticsEventHandlers';
import { AnalyticsReplayService }             from '../analytics/application/replay/AnalyticsReplayService';
import { AnalyticsReplayWorker }              from '../analytics/application/replay/AnalyticsReplayWorker';
import { AnalyticsReplayProgressTracker }     from '../analytics/application/replay/AnalyticsReplayProgressTracker';

// ─── Tracking ─────────────────────────────────────────────────────────────────
import { SqlOrderLifecycleProjectionRepository } from '../tracking/infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository }            from '../tracking/infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository }          from '../tracking/infrastructure/repositories/SqlProcessedEventsRepository';
import { ProjectionUpdateService }               from '../tracking/application/ProjectionUpdateService';
import { ProjectionEventHandlerRegistry }        from '../tracking/application/ProjectionEventHandlerRegistry';
import { OrderCreatedProjectionHandler }          from '../tracking/application/handlers/OrderCreatedProjectionHandler';
import { PaymentConfirmedProjectionHandler }      from '../tracking/application/handlers/PaymentConfirmedProjectionHandler';
import { ProjectionEventDispatcher }             from '../tracking/application/dispatcher/ProjectionEventDispatcher';
import { EventOrderingValidator }                from '../tracking/application/ordering/EventOrderingValidator';
import { OutboxProjectionEventSource }           from '../tracking/infrastructure/events/OutboxProjectionEventSource';
import { ReplayService as TrackingReplayService } from '../tracking/application/replay/ReplayService';
import { ReplayRepository as TrackingReplayRepository } from '../tracking/infrastructure/replay/ReplayRepository';
import { LifecycleState }                        from '../tracking/domain/enums/LifecycleState';

// ─── Helpers: sequential drain (same approach as test_flow_propagation.ts) ───

async function drainScheduling(
  source: SchedulingEventSource,
  dispatcher: SchedulingEventDispatcher
): Promise<void> {
  const failed = new Set<string>();
  while (true) {
    const events = await source.poll(50);
    if (events.length === 0) break;
    const todo = events.filter(e => !failed.has(e.eventId));
    if (todo.length === 0) break;
    for (const event of todo) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await dispatcher.dispatch(event, conn);
        await source.acknowledge(event, conn);
        await conn.commit();
      } catch (err: any) {
        await conn.rollback();
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [drainScheduling] ${event.eventType}: ${err.message}`);
        }
        failed.add(event.eventId);
        const c2 = await db.getConnection();
        try { await source.acknowledge(event, c2); } catch (_) {} finally { c2.release(); }
      } finally { conn.release(); }
    }
  }
}

async function drainNotification(
  source: NotificationEventSource,
  dispatcher: NotificationEventDispatcher
): Promise<void> {
  const failed = new Set<string>();
  while (true) {
    const events = await source.poll(50);
    if (events.length === 0) break;
    const todo = events.filter(e => !failed.has(e.eventId));
    if (todo.length === 0) break;
    for (const event of todo) {
      try {
        await dispatcher.dispatch(event);
        await source.acknowledge(event);
      } catch (err: any) {
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [drainNotification] ${event.eventType}: ${err.message}`);
        }
        failed.add(event.eventId);
        try { await source.acknowledge(event); } catch (_) {}
      }
    }
  }
}

async function drainAnalytics(
  source: AnalyticsEventSource,
  dispatcher: AnalyticsEventDispatcher
): Promise<void> {
  const failed = new Set<string>();
  while (true) {
    const events = await source.poll(50);
    if (events.length === 0) break;
    const todo = events.filter(e => !failed.has(e.eventId));
    if (todo.length === 0) break;
    for (const event of todo) {
      try {
        await dispatcher.dispatch(event);
        await source.acknowledge(event);
      } catch (err: any) {
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [drainAnalytics] ${event.eventType}: ${err.message}`);
        }
        failed.add(event.eventId);
        try { await source.acknowledge(event); } catch (_) {}
      }
    }
  }
}

async function drainTracking(
  source: OutboxProjectionEventSource,
  dispatcher: ProjectionEventDispatcher,
  orderingValidator: EventOrderingValidator
): Promise<void> {
  const failed = new Set<string>();
  const workerId = `replay-test-${crypto.randomUUID()}`;
  while (true) {
    const events = await source.poll(50);
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
      } catch (err: any) {
        await conn.rollback();
        if (!err.message.includes('UNIQUE') && !err.message.includes('Duplicate')) {
          console.error(`  [drainTracking] ${event.eventType}: ${err.message}`);
        }
        failed.add(event.eventId);
        await source.release([event]);
      } finally { conn.release(); }
    }
  }
}

/**
 * Wait for a replay worker tracker to report completed or failed.
 * All replay workers chunk via setTimeout, so we must poll.
 */
async function waitForReplay(
  getStatus: () => { status: string },
  label: string,
  timeoutMs = 30000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = getStatus();
    if (status === 'completed') {
      console.log(`  ✅ [${label}] Replay completed`);
      return;
    }
    if (status === 'failed') {
      throw new Error(`[${label}] Replay FAILED`);
    }
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error(`[${label}] Replay timed out after ${timeoutMs}ms`);
}

// ─── Mock Razorpay SDK ────────────────────────────────────────────────────────
class MockRazorpaySDK {
  public orders = {
    create: async (params: any) => ({
      id:       `rzp_order_mock_replay_${Date.now()}`,
      status:   'created',
      amount:   params.amount,
      currency: params.currency,
      receipt:  params.receipt,
      entity:   'order',
    })
  };
}

function computeSignature(orderId: string, paymentId: string): string {
  const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

// ─── Checks ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results: Array<{ name: string; status: 'PASS' | 'FAIL'; reason?: string }> = [];

function check(name: string, condition: boolean, reason?: string) {
  if (condition) {
    results.push({ name, status: 'PASS' });
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    results.push({ name, status: 'FAIL', reason: reason || 'false' });
    failed++;
    console.error(`  [FAIL] ${name}  ← ${reason || 'false'}`);
  }
}

async function countRows(table: string): Promise<number> {
  const [rows] = await db.execute(`SELECT COUNT(*) as c FROM ${table}`);
  return Number((rows as any[])[0]?.c ?? 0);
}

async function sumRevenue(): Promise<number> {
  const [rows] = await db.execute('SELECT SUM(revenue) as s FROM analytics_order_facts');
  return Number((rows as any[])[0]?.s ?? 0);
}

// ─── Seed Helpers ─────────────────────────────────────────────────────────────
const STUDENT_ID = 199;
const MANAGER_ID = 130;
const SHOP_ID    = 140;

interface SeedResult {
  orderId:      number;
  paymentUuid:  string;
  outboxEventIds: string[]; // event_ids seeded
}

async function seedCompletedOrder(
  idx: number,
  paymentService: PaymentService,
  finalizationService: OrderFinalizationService,
  outboxRepo: SqlOutboxRepository,
  schedulingSource: SchedulingEventSource,
  schedulingDispatcher: SchedulingEventDispatcher,
  notificationSource: NotificationEventSource,
  notificationDispatcher: NotificationEventDispatcher,
  analyticsSource: AnalyticsEventSource,
  analyticsDispatcher: AnalyticsEventDispatcher,
  outboxProjSource: OutboxProjectionEventSource,
  projDispatcher: ProjectionEventDispatcher,
  orderingValidator: EventOrderingValidator
): Promise<SeedResult> {
  const ORDER_ID    = 10000 + idx;
  const PRICE       = 100 + idx * 50;
  const CORRELATION = `corr-replay-${ORDER_ID}`;

  // Insert order row
  await db.execute(
    `INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price, total_pages, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [ORDER_ID, `hash-replay-${ORDER_ID}`, STUDENT_ID, SHOP_ID, 'pending', PRICE, 5 + idx]
  );

  // Stage ORDER_CREATED outbox event
  const orderCreatedEventId = crypto.randomUUID();
  const orderCreatedEvent = new OutboxEvent(
    null, orderCreatedEventId, 'ORDER_CREATED', 'ORDER', String(ORDER_ID),
    JSON.stringify({
      orderId: ORDER_ID, orderHash: `hash-replay-${ORDER_ID}`,
      shopId: SHOP_ID, shopName: 'Campus Shop Main',
      studentId: STUDENT_ID, userId: STUDENT_ID,
      deliveryType: 'pickup', hostelAddress: null,
      pagesCount: 5 + idx, totalPages: 5 + idx,
      duplex: false, color: false, totalPrice: PRICE
    }),
    OutboxEventStatus.PENDING, 0, null, CORRELATION, 1, new Date()
  );
  await outboxRepo.create(orderCreatedEvent);

  // Process ORDER_CREATED through all contexts
  await drainScheduling(schedulingSource, schedulingDispatcher);
  await drainNotification(notificationSource, notificationDispatcher);
  await drainAnalytics(analyticsSource, analyticsDispatcher);
  await drainTracking(outboxProjSource, projDispatcher, orderingValidator);

  // Payment flow
  const initRes = await paymentService.initiatePayment({
    orderId: ORDER_ID, studentId: STUDENT_ID,
    paymentMethod: PaymentMethod.UPI,
    gateway: PaymentGatewayProvider.RAZORPAY,
    idempotencyKey: `idemp-replay-${ORDER_ID}`
  });
  const paymentId = `pay_replay_${ORDER_ID}`;
  const sig = computeSignature(initRes.gatewayOrderId!, paymentId);
  await paymentService.verifyPayment({
    paymentUuid: initRes.uuid,
    gatewayPaymentId: paymentId,
    gatewayOrderId:   initRes.gatewayOrderId!,
    signature: sig
  }, STUDENT_ID);
  await finalizationService.finalizeOrder(initRes.uuid);

  // Let Tracking consume ORDER_FINALIZED before it gets marked PROCESSED
  await drainTracking(outboxProjSource, projDispatcher, orderingValidator);

  // Write PAYMENT_CONFIRMED bridge event
  const [finalizedRows]: any = await db.execute(
    "SELECT * FROM outbox_events WHERE event_type = 'ORDER_FINALIZED' AND aggregate_id = ? ORDER BY id DESC LIMIT 1",
    [String(ORDER_ID)]
  );
  const finalizedPayload = (finalizedRows as any[])[0]
    ? JSON.parse((finalizedRows as any[])[0].payload) : {};

  const paymentConfirmedEventId = crypto.randomUUID();
  const bridgeEvent = new OutboxEvent(
    null, paymentConfirmedEventId, 'PAYMENT_CONFIRMED', 'PAYMENT', String(ORDER_ID),
    JSON.stringify({
      orderId: ORDER_ID, shopId: SHOP_ID, userId: STUDENT_ID,
      amount: PRICE,
      paymentReference:  finalizedPayload.paymentReference  || '',
      gatewayPaymentId:  finalizedPayload.gatewayPaymentId  || '',
      invoiceNumber:     finalizedPayload.invoiceNumber      || ''
    }),
    OutboxEventStatus.PENDING, 0, null, CORRELATION, 1, new Date()
  );
  await outboxRepo.create(bridgeEvent);

  // Drain PAYMENT_CONFIRMED through all contexts
  await drainScheduling(schedulingSource, schedulingDispatcher);
  await drainNotification(notificationSource, notificationDispatcher);
  await drainAnalytics(analyticsSource, analyticsDispatcher);
  await drainTracking(outboxProjSource, projDispatcher, orderingValidator);

  return {
    orderId:     ORDER_ID,
    paymentUuid: initRes.uuid,
    outboxEventIds: [orderCreatedEventId, paymentConfirmedEventId]
  };
}

// ─── Business-data snapshot types ────────────────────────────────────────────

/**
 * Per-order fingerprint — captures every business-critical field so that
 * post-replay comparisons verify *data correctness*, not just row counts.
 */
interface OrderSnapshot {
  orderId:            number;
  // Tracking projection fields
  lifecycleState:     string | null;
  invoiceNumber:      string | null;
  totalPrice:         number | null;
  paymentStatus:      string | null;
  // Tracking timeline
  timelineEventCount: number;
  timelineStates:     string[];  // ordered list of states for this order
  // Notifications (for the seeded student)
  notifCount:         number;
  notifTitles:        string[];  // sorted for stable comparison
  // Analytics fact
  analyticsRevenue:   number | null;
  paymentConfirmedAt: string | null;  // date-only YYYY-MM-DD for stability
}

interface Baseline {
  // ── Row counts (quick diff) ────────────────────────────────────────────
  schedulingQueueSlots:  number;
  trackingProjections:   number;
  trackingTimeline:      number;
  notifications:         number;
  analyticsOrderFacts:   number;
  analyticsDailyMetrics: number;
  analyticsShopMetrics:  number;
  analyticsUserMetrics:  number;
  // ── Aggregate business data ────────────────────────────────────────────
  revenueTotal:          number;
  completedOrders:       number;  // projections with state = CONFIRMED
  cancelledOrders:       number;  // projections with state = CANCELLED
  // ── Health counters ────────────────────────────────────────────────────
  dlqCount:              number;
  pendingOutboxCount:    number;  // outbox_events still PENDING
  // ── Per-order fingerprints ─────────────────────────────────────────────
  orderSnapshots:        OrderSnapshot[];
}

/** Build a per-order fingerprint by querying each relevant table. */
async function captureOrderSnapshot(
  orderId: number,
  studentId: number
): Promise<OrderSnapshot> {
  // ── Tracking projection ──
  const [projRows] = await db.execute(
    'SELECT current_state, invoice_number, total_price, payment_status FROM order_lifecycle_projections WHERE order_id = ?',
    [orderId]
  );
  const proj = (projRows as any[])[0] ?? null;

  // ── Tracking timeline ──
  // Note: order_lifecycle_timeline_events uses column `state`, not `current_state`
  const [timelineRows] = await db.execute(
    'SELECT state FROM order_lifecycle_timeline_events WHERE order_id = ? ORDER BY id ASC',
    [orderId]
  );
  const timelineStates = (timelineRows as any[]).map((r: any) => r.state as string);

  // ── Notifications for this student ──
  const [notifRows] = await db.execute(
    'SELECT title FROM notifications WHERE user_id = ? ORDER BY title ASC',
    [studentId]
  );
  const notifTitles: string[] = (notifRows as any[]).map((r: any) => String(r.title));

  // ── Analytics fact ──
  const [factRows] = await db.execute(
    'SELECT revenue, payment_confirmed_at FROM analytics_order_facts WHERE order_id = ?',
    [orderId]
  );
  const fact = (factRows as any[])[0] ?? null;
  const paymentConfirmedAt = fact?.payment_confirmed_at
    ? String(fact.payment_confirmed_at).slice(0, 10)  // YYYY-MM-DD
    : null;

  return {
    orderId,
    lifecycleState:     proj ? String(proj.current_state) : null,
    invoiceNumber:      proj?.invoice_number ?? null,
    totalPrice:         proj ? Number(proj.total_price) : null,
    paymentStatus:      proj?.payment_status ?? null,
    timelineEventCount: timelineStates.length,
    timelineStates,
    notifCount:         notifTitles.length,
    notifTitles,
    analyticsRevenue:   fact ? Number(fact.revenue) : null,
    paymentConfirmedAt,
  };
}

async function captureBaseline(orderIds: number[], studentId: number): Promise<Baseline> {
  // Aggregate counts
  const [completedRows] = await db.execute(
    `SELECT COUNT(*) as c FROM order_lifecycle_projections WHERE current_state = '${LifecycleState.CONFIRMED}'`
  );
  const [cancelledRows] = await db.execute(
    `SELECT COUNT(*) as c FROM order_lifecycle_projections WHERE current_state = 'CANCELLED'`
  );
  const [dlqRows]     = await db.execute('SELECT COUNT(*) as c FROM dead_letter_events');
  const [outboxRows]  = await db.execute(`SELECT COUNT(*) as c FROM outbox_events WHERE status = 'PENDING'`);

  // Per-order snapshots
  const orderSnapshots: OrderSnapshot[] = [];
  for (const orderId of orderIds) {
    orderSnapshots.push(await captureOrderSnapshot(orderId, studentId));
  }

  return {
    schedulingQueueSlots:  await countRows('scheduling_print_queue'),
    trackingProjections:   await countRows('order_lifecycle_projections'),
    trackingTimeline:      await countRows('order_lifecycle_timeline_events'),
    notifications:         await countRows('notifications'),
    analyticsOrderFacts:   await countRows('analytics_order_facts'),
    analyticsDailyMetrics: await countRows('analytics_daily_metrics'),
    analyticsShopMetrics:  await countRows('analytics_shop_metrics'),
    analyticsUserMetrics:  await countRows('analytics_user_metrics'),
    revenueTotal:          await sumRevenue(),
    completedOrders:       Number((completedRows as any[])[0]?.c ?? 0),
    cancelledOrders:       Number((cancelledRows as any[])[0]?.c ?? 0),
    dlqCount:              Number((dlqRows as any[])[0]?.c ?? 0),
    pendingOutboxCount:    Number((outboxRows as any[])[0]?.c ?? 0),
    orderSnapshots,
  };
}

// ─── compareBaselines — shared assertion helper ───────────────────────────────

/**
 * Deep-compares two baseline snapshots and calls check() for every field.
 * Used identically for the first-replay and idempotency passes so that the
 * same rigorous assertions run in both cases.
 */
async function compareBaselines(
  label: string,
  before: Baseline,
  after: Baseline
): Promise<void> {
  // ── Row counts ──
  check(
    `${label}: scheduling queue slots rebuilt`,
    after.schedulingQueueSlots === before.schedulingQueueSlots,
    `expected ${before.schedulingQueueSlots}, got ${after.schedulingQueueSlots}`
  );
  check(
    `${label}: tracking projections rebuilt`,
    after.trackingProjections === before.trackingProjections,
    `expected ${before.trackingProjections}, got ${after.trackingProjections}`
  );
  check(
    `${label}: tracking timeline rebuilt`,
    after.trackingTimeline === before.trackingTimeline,
    `expected ${before.trackingTimeline}, got ${after.trackingTimeline}`
  );
  check(
    `${label}: notifications count rebuilt`,
    after.notifications === before.notifications,
    `expected ${before.notifications}, got ${after.notifications}`
  );
  check(
    `${label}: analytics order facts rebuilt`,
    after.analyticsOrderFacts === before.analyticsOrderFacts,
    `expected ${before.analyticsOrderFacts}, got ${after.analyticsOrderFacts}`
  );
  check(
    `${label}: analytics daily metrics rebuilt`,
    after.analyticsDailyMetrics >= 1,
    `got ${after.analyticsDailyMetrics}`
  );
  check(
    `${label}: analytics shop metrics rebuilt`,
    after.analyticsShopMetrics >= 1,
    `got ${after.analyticsShopMetrics}`
  );
  check(
    `${label}: analytics user metrics rebuilt`,
    after.analyticsUserMetrics >= 1,
    `got ${after.analyticsUserMetrics}`
  );

  // ── Aggregate business data ──
  check(
    `${label}: revenue total unchanged`,
    after.revenueTotal === before.revenueTotal,
    `expected ${before.revenueTotal}, got ${after.revenueTotal}`
  );
  check(
    `${label}: completed orders count unchanged`,
    after.completedOrders === before.completedOrders,
    `expected ${before.completedOrders}, got ${after.completedOrders}`
  );
  check(
    `${label}: cancelled orders count unchanged`,
    after.cancelledOrders === before.cancelledOrders,
    `expected ${before.cancelledOrders}, got ${after.cancelledOrders}`
  );

  // ── Health: DLQ and pending outbox must be empty ──
  check(
    `${label}: DLQ is empty`,
    after.dlqCount === 0,
    `DLQ has ${after.dlqCount} row(s)`
  );
  check(
    `${label}: no pending outbox events after replay`,
    after.pendingOutboxCount === 0,
    `${after.pendingOutboxCount} event(s) still PENDING in outbox`
  );

  // ── Per-order fingerprint comparison ──
  for (const snap of before.orderSnapshots) {
    const rebuilt = after.orderSnapshots.find(s => s.orderId === snap.orderId);
    check(
      `${label}: order ${snap.orderId} projection exists`,
      rebuilt != null,
      'projection row missing after replay'
    );
    if (!rebuilt) continue;

    check(
      `${label}: order ${snap.orderId} lifecycleState = ${snap.lifecycleState}`,
      rebuilt.lifecycleState === snap.lifecycleState,
      `expected '${snap.lifecycleState}', got '${rebuilt.lifecycleState}'`
    );
    check(
      `${label}: order ${snap.orderId} invoiceNumber`,
      rebuilt.invoiceNumber === snap.invoiceNumber,
      `expected '${snap.invoiceNumber}', got '${rebuilt.invoiceNumber}'`
    );
    check(
      `${label}: order ${snap.orderId} totalPrice`,
      rebuilt.totalPrice === snap.totalPrice,
      `expected ${snap.totalPrice}, got ${rebuilt.totalPrice}`
    );
    check(
      `${label}: order ${snap.orderId} paymentStatus`,
      rebuilt.paymentStatus === snap.paymentStatus,
      `expected '${snap.paymentStatus}', got '${rebuilt.paymentStatus}'`
    );
    check(
      `${label}: order ${snap.orderId} timeline event count`,
      rebuilt.timelineEventCount === snap.timelineEventCount,
      `expected ${snap.timelineEventCount} timeline events, got ${rebuilt.timelineEventCount}`
    );
    check(
      `${label}: order ${snap.orderId} timeline state sequence identical`,
      JSON.stringify(rebuilt.timelineStates) === JSON.stringify(snap.timelineStates),
      `expected [${snap.timelineStates.join(',')}], got [${rebuilt.timelineStates.join(',')}]`
    );
    check(
      `${label}: order ${snap.orderId} notification count`,
      rebuilt.notifCount === snap.notifCount,
      `expected ${snap.notifCount} notifications, got ${rebuilt.notifCount}`
    );
    check(
      `${label}: order ${snap.orderId} notification titles identical`,
      JSON.stringify(rebuilt.notifTitles) === JSON.stringify(snap.notifTitles),
      `expected ${JSON.stringify(snap.notifTitles)}, got ${JSON.stringify(rebuilt.notifTitles)}`
    );
    check(
      `${label}: order ${snap.orderId} analytics revenue`,
      rebuilt.analyticsRevenue === snap.analyticsRevenue,
      `expected ${snap.analyticsRevenue}, got ${rebuilt.analyticsRevenue}`
    );
    check(
      `${label}: order ${snap.orderId} paymentConfirmedAt is set`,
      rebuilt.paymentConfirmedAt != null,
      'paymentConfirmedAt is null — PAYMENT_CONFIRMED event was not replayed'
    );
    check(
      `${label}: order ${snap.orderId} paymentConfirmedAt date matches`,
      rebuilt.paymentConfirmedAt === snap.paymentConfirmedAt,
      `expected '${snap.paymentConfirmedAt}', got '${rebuilt.paymentConfirmedAt}'`
    );
  }
}

// ─── checkNoOrphans — referential integrity after replay ──────────────────────

/**
 * Verifies that no read-model table contains rows that reference a non-existent
 * parent (order). Orphans indicate partial replay, incorrect DELETE cascades,
 * or bugs in the wipe logic.
 */
async function checkNoOrphans(label: string): Promise<void> {
  // Timeline rows without a matching projection
  const [orphanTimeline] = await db.execute(`
    SELECT COUNT(*) as c
    FROM   order_lifecycle_timeline_events t
    WHERE  NOT EXISTS (
      SELECT 1 FROM order_lifecycle_projections p WHERE p.order_id = t.order_id
    )
  `);
  check(
    `${label}: no orphan timeline rows`,
    Number((orphanTimeline as any[])[0]?.c ?? 0) === 0,
    `${(orphanTimeline as any[])[0]?.c} orphan timeline row(s) found`
  );

  // Analytics facts without a matching order
  const [orphanFacts] = await db.execute(`
    SELECT COUNT(*) as c
    FROM   analytics_order_facts f
    WHERE  NOT EXISTS (
      SELECT 1 FROM orders o WHERE o.id = f.order_id
    )
  `);
  check(
    `${label}: no orphan analytics facts`,
    Number((orphanFacts as any[])[0]?.c ?? 0) === 0,
    `${(orphanFacts as any[])[0]?.c} orphan analytics fact(s) found`
  );

  // Scheduling queue rows without a matching order
  const [orphanQueue] = await db.execute(`
    SELECT COUNT(*) as c
    FROM   scheduling_print_queue q
    WHERE  NOT EXISTS (
      SELECT 1 FROM orders o WHERE o.id = q.order_id
    )
  `);
  check(
    `${label}: no orphan scheduling queue rows`,
    Number((orphanQueue as any[])[0]?.c ?? 0) === 0,
    `${(orphanQueue as any[])[0]?.c} orphan scheduling queue row(s) found`
  );
}

async function wipeProjectionTables(): Promise<void> {
  // Scheduling read-models (not the capacity/printer/inventory source tables)
  await db.execute('DELETE FROM scheduling_print_queue');
  await db.execute('DELETE FROM scheduling_processed_events');
  // Reset inventory to initial quantities so replay can re-reserve correctly
  await db.execute("UPDATE scheduling_inventory SET quantity = 1000 WHERE type = 'paper'");
  await db.execute("UPDATE scheduling_inventory SET quantity = 100  WHERE type = 'ink'");

  // Tracking projections
  await db.execute('DELETE FROM order_lifecycle_projections');
  await db.execute('DELETE FROM order_lifecycle_timeline_events');
  await db.execute('DELETE FROM processed_events');

  // Notifications
  await db.execute('DELETE FROM notifications');
  try { await db.execute('DELETE FROM notification_delivery_attempts'); } catch (_) {}
  await db.execute('DELETE FROM processed_notification_events');

  // Analytics
  await db.execute('DELETE FROM analytics_order_facts');
  await db.execute('DELETE FROM analytics_daily_metrics');
  await db.execute('DELETE FROM analytics_shop_metrics');
  await db.execute('DELETE FROM analytics_user_metrics');
  await db.execute('DELETE FROM analytics_events_processed');

  // Dead-letter queue
  await db.execute('DELETE FROM dead_letter_events');

  console.log('  [Wipe] All projection/read-model tables cleared.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function runReplayValidation(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       CampusPrint Replay Validation Script                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Clean slate ──────────────────────────────────────────────────────────
  await db.execute('PRAGMA foreign_keys = OFF');
  const wipeAll = [
    'fulfillment_history','fulfillments','print_job_history','print_jobs','invoices',
    'payments','payment_webhook_events','orders','shops','users','outbox_events',
    'transactions','scheduling_processed_events','scheduling_print_queue',
    'scheduling_shops_capacity','scheduling_printers','scheduling_inventory',
    'scheduling_snapshots',
    'processed_notification_events','notifications','notification_templates',
    'notification_preferences',
    'processed_events','order_lifecycle_projections','order_lifecycle_timeline_events',
    'dead_letter_events','analytics_order_facts','analytics_events_processed',
    'analytics_daily_metrics','analytics_shop_metrics','analytics_user_metrics',
  ];
  for (const t of wipeAll) { try { await db.execute(`DELETE FROM ${t}`); } catch (_) {} }
  await db.execute('PRAGMA foreign_keys = ON');

  // ── Infrastructure ───────────────────────────────────────────────────────
  // Scheduling repos
  const capacityRepo  = new SqlShopCapacityRepository();
  const printerRepo   = new SqlPrinterRepository();
  const inventoryRepo = new SqlInventoryRepository();
  const snapshotRepo  = new SqlSchedulingSnapshotRepository();

  // Notification repos
  const templateRepo   = new SqlNotificationTemplateRepository();
  const preferenceRepo = new SqlNotificationPreferenceRepository();
  const notifRepo      = new SqlNotificationRepository();

  // Analytics repos
  const factRepo          = new SqlOrderFactRepository();
  const metricRepo        = new SqlAnalyticsMetricRepository();
  const shopAnalyticsRepo = new SqlShopAnalyticsRepository();
  const userAnalyticsRepo = new SqlUserAnalyticsRepository();
  const aggregationService = new AnalyticsAggregationService(factRepo, metricRepo, shopAnalyticsRepo, userAnalyticsRepo);

  // Tracking repos
  const projRepo            = new SqlOrderLifecycleProjectionRepository();
  const timelineRepo        = new SqlTimelineEventRepository();
  const processedEventsRepo = new SqlProcessedEventsRepository();
  const trackingUpdateSvc   = new ProjectionUpdateService(projRepo, timelineRepo, processedEventsRepo);

  // Payment repos
  const orderRepo    = new SqlOrderRepository();
  const paymentRepo  = new SqlPaymentRepository();
  const invoiceRepo  = new SqlInvoiceRepository();
  const printJobRepo = new SqlPrintJobRepository();
  const outboxRepo   = new SqlOutboxRepository();
  const webhookRepo  = new SqlWebhookEventRepository();

  const mockSDK  = new MockRazorpaySDK();
  const gateway  = new RazorpayGateway(mockSDK);
  const paymentService      = new PaymentService(paymentRepo, gateway, webhookRepo);
  const finalizationService = new OrderFinalizationService(paymentRepo, orderRepo, invoiceRepo, printJobRepo, outboxRepo);

  // ── Seed base entities ────────────────────────────────────────────────────
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified, wallet_balance) VALUES (?,?,?,?,?,?,?)',
    [STUDENT_ID, 'Replay Student', 'replay@campus.edu', 'p', 'student', 1, 0]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified, wallet_balance) VALUES (?,?,?,?,?,?,?)',
    [MANAGER_ID, 'Replay Manager', 'replaymgr@cp.com', 'p', 'shop', 1, 0]
  );
  await db.execute(
    'INSERT INTO shops (id, shop_name, user_id, wallet_balance) VALUES (?,?,?,?)',
    [SHOP_ID, 'Campus Shop Main', MANAGER_ID, 0]
  );
  await capacityRepo.create(new ShopCapacity(SHOP_ID, 10, 7200, true, 1));
  const caps = new PrinterCapabilities(20, true, true, ['A4'], 200, ['plain']);
  await printerRepo.create(new Printer(null, SHOP_ID, 'Replay-Printer', PrinterStatus.AVAILABLE, caps));
  await inventoryRepo.create(new InventoryItem(null, SHOP_ID, 'paper', 'A4',   1000, 'sheets',     200));
  await inventoryRepo.create(new InventoryItem(null, SHOP_ID, 'ink',   'Black', 100, 'percentage',  20));
  await inventoryRepo.create(new InventoryItem(null, SHOP_ID, 'ink',   'Color', 100, 'percentage',  20));

  // Notification templates
  await templateRepo.create(new NotificationTemplate(null, 'ORDER_CREATED',    'Order Placed',       'Order {{orderId}} placed.',       '<p>Order {{orderId}} placed.</p>'));
  await templateRepo.create(new NotificationTemplate(null, 'PAYMENT_CONFIRMED','Payment Confirmed',  'Payment for {{orderId}} confirmed.','<p>Payment for {{orderId}} confirmed.</p>'));

  // ── Build dispatchers for seeding ─────────────────────────────────────────
  const strategy       = new ECTSchedulingStrategy();
  const schedulingDisp = new SchedulingEventDispatcher(
    new SchedulingEngine(
      new CapacityCalculator(capacityRepo, printerRepo),
      new InventoryService(inventoryRepo),
      new PrinterAssignmentService(printerRepo, strategy)
    ),
    new QueueService(printerRepo, new PrinterAssignmentService(printerRepo, strategy)),
    new InventoryService(inventoryRepo),
    new MaintenancePlanner(printerRepo),
    capacityRepo, printerRepo
  );
  schedulingDisp.register('ORDER_CREATED',    new SchedulingOrderCreatedHandler());
  schedulingDisp.register('ORDER_CANCELLED',  new SchedulingOrderCancelledHandler());
  schedulingDisp.register('PRINT_STARTED',    new SchedulingPrintStartedHandler());
  schedulingDisp.register('PRINT_COMPLETED',  new SchedulingPrintCompletedHandler());

  const notifService = new NotificationService(
    templateRepo,
    new DeliveryService(
      notifRepo, new EmailChannelHandler(),
      new InAppChannelHandler(notifRepo),
      new ChannelRouter(new PreferenceResolver(preferenceRepo)),
      new TemplateEngine()
    )
  );
  const notifDisp = new NotificationEventDispatcher();
  notifDisp.register('ORDER_CREATED',     new NotifOrderCreatedHandler(notifService));
  notifDisp.register('PAYMENT_CONFIRMED', new NotifPaymentConfirmedHandler(notifService));

  const analyticsDisp = new AnalyticsEventDispatcher();
  analyticsDisp.register('ORDER_CREATED',     new OrderCreatedAnalyticsHandler(factRepo, aggregationService));
  analyticsDisp.register('PAYMENT_CONFIRMED', new PaymentConfirmedAnalyticsHandler(factRepo, aggregationService));

  const trackingRegistry = new ProjectionEventHandlerRegistry();
  trackingRegistry.register('ORDER_CREATED',   new OrderCreatedProjectionHandler());
  trackingRegistry.register('ORDER_FINALIZED', new PaymentConfirmedProjectionHandler());
  const trackingDisp      = new ProjectionEventDispatcher(trackingRegistry, trackingUpdateSvc);
  const orderingValidator = new EventOrderingValidator(projRepo);

  const schedulingSource = new SchedulingEventSource();
  const notifSource      = new NotificationEventSource();
  const analyticsSource  = new AnalyticsEventSource();
  const outboxProjSource = new OutboxProjectionEventSource();

  // ── Step 1: Seed 2 completed orders ──────────────────────────────────────
  console.log('🔹 Step 1: Seeding 2 completed orders...');
  const seeds: SeedResult[] = [];
  for (let i = 1; i <= 2; i++) {
    const result = await seedCompletedOrder(
      i, paymentService, finalizationService, outboxRepo,
      schedulingSource, schedulingDisp,
      notifSource,      notifDisp,
      analyticsSource,  analyticsDisp,
      outboxProjSource, trackingDisp, orderingValidator
    );
    seeds.push(result);
    console.log(`  Seeded order ${result.orderId} ✓`);
  }

  const seededOrderIds = seeds.map(s => s.orderId);

  // ── Step 2: Record rich baseline ─────────────────────────────────────────
  console.log('\n🔹 Step 2: Recording business-data baseline...');
  const baseline = await captureBaseline(seededOrderIds, STUDENT_ID);

  console.log(`  scheduling_print_queue:          ${baseline.schedulingQueueSlots}`);
  console.log(`  order_lifecycle_projections:     ${baseline.trackingProjections}`);
  console.log(`  order_lifecycle_timeline_events: ${baseline.trackingTimeline}`);
  console.log(`  notifications:                   ${baseline.notifications}`);
  console.log(`  analytics_order_facts:           ${baseline.analyticsOrderFacts}`);
  console.log(`  analytics_daily_metrics:         ${baseline.analyticsDailyMetrics}`);
  console.log(`  analytics_shop_metrics:          ${baseline.analyticsShopMetrics}`);
  console.log(`  analytics_user_metrics:          ${baseline.analyticsUserMetrics}`);
  console.log(`  analytics revenue total:         ${baseline.revenueTotal}`);
  console.log(`  completed orders (CONFIRMED):    ${baseline.completedOrders}`);
  console.log(`  cancelled orders:                ${baseline.cancelledOrders}`);
  console.log(`  DLQ count:                       ${baseline.dlqCount}`);
  console.log(`  pending outbox events:           ${baseline.pendingOutboxCount}`);
  for (const snap of baseline.orderSnapshots) {
    console.log(`  order ${snap.orderId}: state=${snap.lifecycleState}, invoice=${snap.invoiceNumber}, price=${snap.totalPrice}, notifs=${snap.notifCount}, revenue=${snap.analyticsRevenue}`);
  }

  // Verify baseline sanity before wipe
  check('Baseline: scheduling slots exist (>=2)',
    baseline.schedulingQueueSlots >= 2);
  check('Baseline: tracking projections exist (>=2)',
    baseline.trackingProjections >= 2);
  check('Baseline: notifications exist (>=4)',
    baseline.notifications >= 4, `got ${baseline.notifications}`);
  check('Baseline: analytics order facts exist (>=2)',
    baseline.analyticsOrderFacts >= 2);
  check('Baseline: revenue total > 0',
    baseline.revenueTotal > 0);
  check('Baseline: completed orders >= seeded count',
    baseline.completedOrders >= seeds.length,
    `expected >=${seeds.length}, got ${baseline.completedOrders}`);
  check('Baseline: DLQ is empty before wipe',
    baseline.dlqCount === 0,
    `DLQ already has ${baseline.dlqCount} row(s) — clean up before replay`);
  check('Baseline: no pending outbox events before wipe',
    baseline.pendingOutboxCount === 0,
    `${baseline.pendingOutboxCount} event(s) still PENDING — drain before replay`);
  // Per-order: each seeded order must be CONFIRMED with invoiceNumber set
  for (const snap of baseline.orderSnapshots) {
    check(`Baseline: order ${snap.orderId} state is CONFIRMED`,
      snap.lifecycleState === LifecycleState.CONFIRMED,
      `got '${snap.lifecycleState}'`);
    check(`Baseline: order ${snap.orderId} invoiceNumber is set`,
      snap.invoiceNumber != null && snap.invoiceNumber !== '',
      `invoiceNumber is empty`);
    check(`Baseline: order ${snap.orderId} analyticsRevenue > 0`,
      (snap.analyticsRevenue ?? 0) > 0,
      `revenue is ${snap.analyticsRevenue}`);
    check(`Baseline: order ${snap.orderId} paymentConfirmedAt is set`,
      snap.paymentConfirmedAt != null,
      'paymentConfirmedAt missing in baseline');
  }

  // ── Step 3: Wipe projection/read-model tables ─────────────────────────────
  console.log('\n🔹 Step 3: Wiping projection/read-model tables (preserving source-of-truth)...');
  await wipeProjectionTables();

  // Verify source-of-truth tables are intact
  const ordersAfterWipe   = await countRows('orders');
  const paymentsAfterWipe = await countRows('payments');
  const invoicesAfterWipe = await countRows('invoices');
  const jobsAfterWipe     = await countRows('print_jobs');
  const outboxAfterWipe   = await countRows('outbox_events');
  check('Source-of-truth intact: orders preserved',       ordersAfterWipe   === seeds.length, `got ${ordersAfterWipe}`);
  check('Source-of-truth intact: payments preserved',     paymentsAfterWipe === seeds.length, `got ${paymentsAfterWipe}`);
  check('Source-of-truth intact: invoices preserved',     invoicesAfterWipe === seeds.length, `got ${invoicesAfterWipe}`);
  check('Source-of-truth intact: print_jobs preserved',   jobsAfterWipe     === seeds.length, `got ${jobsAfterWipe}`);
  check('Source-of-truth intact: outbox_events preserved', outboxAfterWipe  >= 4, `got ${outboxAfterWipe}`);

  // Verify projections are actually empty after wipe
  check('After wipe: scheduling_print_queue empty',         await countRows('scheduling_print_queue')       === 0);
  check('After wipe: order_lifecycle_projections empty',    await countRows('order_lifecycle_projections')  === 0);
  check('After wipe: notifications empty',                  await countRows('notifications')                === 0);
  check('After wipe: analytics_order_facts empty',          await countRows('analytics_order_facts')        === 0);

  // ── Step 4: Execute all ReplayServices ───────────────────────────────────
  console.log('\n🔹 Step 4 & 5: Executing ReplayServices and awaiting completion...');

  // Build dedicated (stopped) worker stubs for each ReplayService
  // (replay services call worker.stop() on entry — passing stopped workers is safe)
  const schedEventSource = new SchedulingEventSource();
  const stubSchedWorker  = new SchedulingEventWorker(schedEventSource, schedulingDisp, 99999);

  const stubNotifWorker  = new NotificationEventWorker(notifSource, notifDisp, 99999);
  const stubAnalWorker   = new AnalyticsWorker(analyticsSource, analyticsDisp, 99999);

  // ── Scheduling Replay ──
  const schedTracker     = new SchedulingProgressTracker();
  const schedReplayWorker = new SchedulingReplayWorker(schedulingDisp, schedTracker);
  const schedReplayRepo  = new SchedulingReplayRepository();
  const snapshotSvc      = new SchedulingSnapshotService(capacityRepo, printerRepo, inventoryRepo, snapshotRepo);
  const schedReplaySvc   = new SchedulingReplayService(schedReplayRepo, stubSchedWorker, schedReplayWorker, schedTracker, snapshotSvc);

  console.log('  → Running SchedulingReplayService...');
  await schedReplaySvc.triggerReplay({ reset: true });
  // SchedulingReplayWorker uses setTimeout(0) internally — wait for tracker
  await waitForReplay(() => schedTracker.getProgress(), 'SchedulingReplayService');

  // ── Notification Replay ──
  const notifTracker     = new NotifProgressTracker();
  const notifReplayWorker = new NotificationReplayWorker(notifDisp, notifTracker);
  const notifReplaySvc   = new NotificationReplayService(stubNotifWorker, notifReplayWorker, notifTracker);

  console.log('  → Running NotificationReplayService...');
  await notifReplaySvc.triggerReplay({ reset: true });
  await waitForReplay(() => notifTracker.getProgress(), 'NotificationReplayService');
  // Stop the stub worker immediately — the replay service callback will have restarted it,
  // which would trigger extra background polling ticks that inflate notification counts.
  await stubNotifWorker.stop();

  // ── Analytics Replay ──
  const analTracker      = new AnalyticsReplayProgressTracker();
  const analReplayWorker = new AnalyticsReplayWorker(analyticsDisp, analTracker);
  const analReplaySvc    = new AnalyticsReplayService(stubAnalWorker, analReplayWorker, analTracker);

  console.log('  → Running AnalyticsReplayService...');
  await analReplaySvc.triggerReplay({ reset: true });
  await waitForReplay(() => analTracker.getProgress(), 'AnalyticsReplayService');

  // ── Tracking Replay ──
  // TrackingReplayService requires a ProjectionWorker (optional). Pass undefined.
  const trackingReplayRepo = new TrackingReplayRepository();
  const trackingReplaySvc  = new TrackingReplayService(
    trackingReplayRepo, projRepo, timelineRepo, processedEventsRepo,
    trackingDisp,
    undefined /* no background ProjectionWorker */
  );

  console.log('  → Running TrackingReplayService...');
  await trackingReplaySvc.triggerReplay({ reset: true });
  // TrackingReplayWorker uses setImmediate — getReplayStatus() tracks progress
  await waitForReplay(() => ({ status: trackingReplaySvc.getReplayStatus().status }), 'TrackingReplayService');

  // ── Step 6: Deep business-data verification after first replay ──────────
  console.log('\n🔹 Step 6: Deep-comparing rebuilt data against baseline...');
  const rebuilt = await captureBaseline(seededOrderIds, STUDENT_ID);
  await compareBaselines('Post-Replay [1st]', baseline, rebuilt);
  await checkNoOrphans('Post-Replay [1st]');

  // ── Step 7: Idempotency — run all replays a second time ─────────────────
  console.log('\n🔹 Step 7: Idempotency — running all ReplayServices a second time...');

  // Fresh tracker instances per service (each replay resets its own processed tables)
  const schedTracker2      = new SchedulingProgressTracker();
  const schedReplayWorker2 = new SchedulingReplayWorker(schedulingDisp, schedTracker2);
  const schedReplaySvc2    = new SchedulingReplayService(schedReplayRepo, stubSchedWorker, schedReplayWorker2, schedTracker2, snapshotSvc);
  await schedReplaySvc2.triggerReplay({ reset: true });
  await waitForReplay(() => schedTracker2.getProgress(), 'SchedulingReplayService [2nd]');

  const notifTracker2      = new NotifProgressTracker();
  const notifReplayWorker2 = new NotificationReplayWorker(notifDisp, notifTracker2);
  const notifReplaySvc2    = new NotificationReplayService(stubNotifWorker, notifReplayWorker2, notifTracker2);
  await notifReplaySvc2.triggerReplay({ reset: true });
  await waitForReplay(() => notifTracker2.getProgress(), 'NotificationReplayService [2nd]');
  await stubNotifWorker.stop();

  const analTracker2      = new AnalyticsReplayProgressTracker();
  const analReplayWorker2 = new AnalyticsReplayWorker(analyticsDisp, analTracker2);
  const analReplaySvc2    = new AnalyticsReplayService(stubAnalWorker, analReplayWorker2, analTracker2);
  await analReplaySvc2.triggerReplay({ reset: true });
  await waitForReplay(() => analTracker2.getProgress(), 'AnalyticsReplayService [2nd]');

  const trackingReplaySvc2 = new TrackingReplayService(
    trackingReplayRepo, projRepo, timelineRepo, processedEventsRepo,
    trackingDisp, undefined
  );
  await trackingReplaySvc2.triggerReplay({ reset: true });
  await waitForReplay(() => ({ status: trackingReplaySvc2.getReplayStatus().status }), 'TrackingReplayService [2nd]');

  // ── Deep idempotency comparison — identical assertions as the first pass ─
  console.log('\n🔹 Step 7 (cont.): Deep-comparing 2nd-replay data against baseline...');
  const rebuilt2 = await captureBaseline(seededOrderIds, STUDENT_ID);
  await compareBaselines('Idempotency [2nd Replay]', baseline, rebuilt2);
  await checkNoOrphans('Idempotency [2nd Replay]');

  // ── Final report ──────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                  REPLAY VALIDATION RESULTS                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    const reason = r.reason ? `  ← ${r.reason}` : '';
    console.log(`  ${icon} [${r.status}] ${r.name}${reason}`);
  }
  console.log(`\n  Total: ${passed + failed}  |  PASSED: ${passed}  |  FAILED: ${failed}`);

  if (failed > 0) {
    console.error(`\n❌  ${failed} check(s) FAILED.`);
    process.exit(1);
  } else {
    console.log(`\n🎉  All ${passed} replay validation checks PASSED. Replay system is healthy.`);
    process.exit(0);
  }
}

runReplayValidation().catch(err => {
  console.error('Unexpected failure:', err);
  process.exit(1);
});
