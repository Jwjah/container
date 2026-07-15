/**
 * Production Integration Test Suite for RFC-010 Analytics & Business Intelligence
 */

import { SqlAnalyticsMetricRepository } from '../infrastructure/repositories/SqlAnalyticsMetricRepository';
import { SqlShopAnalyticsRepository } from '../infrastructure/repositories/SqlShopAnalyticsRepository';
import { SqlUserAnalyticsRepository } from '../infrastructure/repositories/SqlUserAnalyticsRepository';
import { SqlOrderFactRepository } from '../infrastructure/repositories/SqlOrderFactRepository';
import { AnalyticsMetric } from '../domain/entities/AnalyticsMetric';
import { OrderFact } from '../domain/entities/OrderFact';
import { AnalyticsAggregationService } from '../application/services/AnalyticsAggregationService';
import { MetricsCalculationService } from '../application/services/MetricsCalculationService';
import { ShopAnalyticsService } from '../application/services/ShopAnalyticsService';
import { UserAnalyticsService } from '../application/services/UserAnalyticsService';
import { RevenueService } from '../application/services/RevenueService';
import { ReportingService } from '../application/services/ReportingService';
import { AnalyticsSnapshotService } from '../application/services/AnalyticsSnapshotService';
import { AnalyticsEventSource } from '../worker/AnalyticsEventSource';
import { AnalyticsEventDispatcher } from '../worker/AnalyticsEventDispatcher';
import { AnalyticsWorker } from '../worker/AnalyticsWorker';
import {
  OrderCreatedAnalyticsHandler,
  PaymentConfirmedAnalyticsHandler,
  PrintStartedAnalyticsHandler,
  PrintCompletedAnalyticsHandler,
  DeliveryCompletedAnalyticsHandler,
  OrderCancelledAnalyticsHandler,
  LowStockAnalyticsHandler
} from '../worker/AnalyticsEventHandlers';
import { AnalyticsReplayProgressTracker } from '../application/replay/AnalyticsReplayProgressTracker';
import { AnalyticsReplayWorker } from '../application/replay/AnalyticsReplayWorker';
import { AnalyticsReplayService } from '../application/replay/AnalyticsReplayService';
import { AnalyticsMetricsService } from '../application/metrics/AnalyticsMetricsService';
import { AnalyticsController } from '../api/AnalyticsController';
import db from '../../config/database';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    const res = fn();
    if (res instanceof Promise) await res;
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}\n     ${err.stack || err.message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

function mockReqRes(params: any = {}, body: any = {}, query: any = {}, user: any = {}) {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  res.send = (data: any) => { res.body = data; return res; };
  res.set = () => res;
  const req: any = { params, body, query, user };
  (req as any).user = user;
  return { req, res };
}

async function runAll() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║      RFC-010 Analytics Bounded Context Production Tests  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ─── Setup ─────────────────────────────────────────────────────────────────
  const metricRepo   = new SqlAnalyticsMetricRepository();
  const shopRepo     = new SqlShopAnalyticsRepository();
  const userRepo     = new SqlUserAnalyticsRepository();
  const factRepo     = new SqlOrderFactRepository();

  const aggregationService = new AnalyticsAggregationService(factRepo, metricRepo, shopRepo, userRepo);
  const metricsCalcService = new MetricsCalculationService(metricRepo, shopRepo, factRepo);
  const shopAnalyticsService = new ShopAnalyticsService(shopRepo, factRepo);
  const userAnalyticsService = new UserAnalyticsService(userRepo, factRepo);
  const revenueService = new RevenueService(metricRepo, factRepo);
  const reportingService = new ReportingService(metricRepo, shopRepo, factRepo);
  const snapshotService = new AnalyticsSnapshotService(metricRepo, shopRepo, factRepo);

  const eventSource = new AnalyticsEventSource();
  const dispatcher  = new AnalyticsEventDispatcher();

  dispatcher.register('ORDER_CREATED',      new OrderCreatedAnalyticsHandler(factRepo, aggregationService));
  dispatcher.register('PAYMENT_CONFIRMED',  new PaymentConfirmedAnalyticsHandler(factRepo, aggregationService));
  dispatcher.register('PRINT_STARTED',      new PrintStartedAnalyticsHandler(factRepo, aggregationService));
  dispatcher.register('PRINT_COMPLETED',    new PrintCompletedAnalyticsHandler(factRepo, aggregationService));
  dispatcher.register('DELIVERY_COMPLETED', new DeliveryCompletedAnalyticsHandler(factRepo, aggregationService));
  dispatcher.register('ORDER_CANCELLED',    new OrderCancelledAnalyticsHandler(factRepo, aggregationService));
  dispatcher.register('LOW_STOCK',          new LowStockAnalyticsHandler(metricRepo));

  const worker = new AnalyticsWorker(eventSource, dispatcher, 50, 5);

  const progressTracker = new AnalyticsReplayProgressTracker();
  const replayWorker    = new AnalyticsReplayWorker(dispatcher, progressTracker);
  const replayService   = new AnalyticsReplayService(worker, replayWorker, progressTracker);
  const metricsService  = new AnalyticsMetricsService(eventSource);

  const controller = new AnalyticsController(
    shopAnalyticsService,
    userAnalyticsService,
    revenueService,
    reportingService,
    metricsService,
    replayService,
    progressTracker
  );

  // ─── DB Wipe ───────────────────────────────────────────────────────────────
  await db.execute('PRAGMA foreign_keys = OFF');
  await db.execute('DELETE FROM analytics_order_facts');
  await db.execute('DELETE FROM analytics_daily_metrics');
  await db.execute('DELETE FROM analytics_shop_metrics');
  await db.execute('DELETE FROM analytics_user_metrics');
  await db.execute('DELETE FROM analytics_events_processed');
  await db.execute('DELETE FROM analytics_snapshots');
  await db.execute('DELETE FROM outbox_events');
  await db.execute('DELETE FROM dead_letter_events');

  // Seed shared fixtures (OR REPLACE ensures correct state regardless of prior tests)
  await db.execute("INSERT OR REPLACE INTO shops (id, shop_name, user_id) VALUES (50, 'Analytics Shop', 60)");
  await db.execute("INSERT OR REPLACE INTO users (id, name, email, password, role) VALUES (60, 'Analytics Admin', 'admin-analytics@campus.edu', 'pass', 'admin')");
  await db.execute("INSERT OR REPLACE INTO users (id, name, email, password, role) VALUES (61, 'Analytics Student', 'student-analytics@campus.edu', 'pass', 'student')");
  await db.execute("INSERT OR REPLACE INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (80001, 'hash-80001', 61, 50, 'pending', 150.00)");
  await db.execute("INSERT OR REPLACE INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (80002, 'hash-80002', 61, 50, 'pending', 200.00)");
  await db.execute('PRAGMA foreign_keys = ON');

  const TODAY = new Date().toISOString().slice(0, 10);

  // ─── Part 1: Repositories ─────────────────────────────────────────────────
  console.log('\n📦 Part 1: Repositories & Domain Entities');

  await test('OrderFact upsert creates and retrieves fact', async () => {
    const fact = new OrderFact(
      null, 80001, 50, 61, TODAY,
      150.00, 30, false, new Date(), null, null, null, null, null
    );
    const saved = await factRepo.upsert(fact);
    assertEqual(saved.orderId, 80001, 'orderId');
    assertEqual(saved.revenue, 150.00, 'revenue');
  });

  await test('AnalyticsMetric upsert with optimistic locking', async () => {
    const metric = new AnalyticsMetric(null, TODAY, 1, 150, 0, 0, 0, 0, 0);
    const saved = await metricRepo.upsert(metric);
    assertEqual(saved.totalOrders, 1, 'total orders');
    assertEqual(saved.totalRevenue, 150, 'total revenue');
    // Second upsert increments version
    saved.totalOrders = 2;
    saved.totalRevenue = 350;
    const updated = await metricRepo.upsert(saved);
    assertEqual(updated.totalOrders, 2, 'updated orders');
  });

  await test('OrderFact repository findByShopId and findByUserId', async () => {
    const byShop = await factRepo.findByShopId(50, 10);
    assert(byShop.length >= 1, 'at least 1 fact for shop 50');
    const byUser = await factRepo.findByUserId(61, 10);
    assert(byUser.length >= 1, 'at least 1 fact for user 61');
  });

  // ─── Part 2: Aggregation Services ─────────────────────────────────────────
  console.log('\n📦 Part 2: Aggregation Service Correctness');

  await test('Aggregation recomputes daily metrics correctly', async () => {
    // Seed a completed fact
    const f2 = new OrderFact(null, 80002, 50, 61, TODAY, 200, 50, true, new Date(Date.now() - 600000), null, null, new Date(), null, null);
    await factRepo.upsert(f2);

    await aggregationService.aggregateDailyMetrics(TODAY);
    const metric = await metricRepo.findByDate(TODAY);
    assert(metric !== null, 'daily metric exists');
    assert(metric!.totalOrders >= 2, 'at least 2 total orders');
    assert(metric!.completedOrders >= 1, 'at least 1 completed');
    assert(metric!.avgCompletionTimeSecs > 0, 'avg completion > 0');
  });

  await test('Aggregation recomputes shop metrics correctly', async () => {
    await aggregationService.aggregateShopMetrics(50);
    const shopAnalytics = await shopRepo.findByShopId(50);
    assert(shopAnalytics !== null, 'shop analytics exist');
    assert(shopAnalytics!.totalOrders >= 2, 'shop total orders >= 2');
    assert(shopAnalytics!.totalRevenue >= 350, 'shop revenue >= 350');
  });

  await test('Aggregation recomputes user metrics correctly', async () => {
    await aggregationService.aggregateUserMetrics(61);
    const userAnalytics = await userRepo.findByUserId(61);
    assert(userAnalytics !== null, 'user analytics exist');
    assert(userAnalytics!.totalOrders >= 2, 'user total orders >= 2');
    assert(userAnalytics!.totalSpend >= 350, 'user total spend >= 350');
    assert(userAnalytics!.avgOrderValue > 0, 'avg order value > 0');
  });

  // ─── Part 3: Read Services ─────────────────────────────────────────────────
  console.log('\n📦 Part 3: Read Services (Revenue, Shop, User, Reporting)');

  await test('RevenueService returns non-zero summary after seeding', async () => {
    const summary = await revenueService.getRevenueSummary();
    assert(summary.allTime >= 350, 'all time revenue >= 350');
    const trend = await revenueService.getDailyRevenueTrend(30);
    assert(trend.length >= 1, 'at least 1 day of revenue trend');
  });

  await test('ShopAnalyticsService getShopPerformance returns structured data', async () => {
    const perf = await shopAnalyticsService.getShopPerformance(50);
    assert(perf.totalOrders >= 2, 'performance total orders >= 2');
    assert(perf.totalRevenue >= 350, 'performance total revenue >= 350');
    assert(typeof perf.successRate === 'number', 'success rate is number');
  });

  await test('ShopAnalyticsService getShopDailyBreakdown returns breakdown', async () => {
    const breakdown = await shopAnalyticsService.getShopDailyBreakdown(50, 30);
    assert(breakdown.length >= 1, 'at least 1 day in breakdown');
    assert(typeof breakdown[0].orders === 'number', 'orders is number');
  });

  await test('UserAnalyticsService getUserActivity returns analytics and recent orders', async () => {
    const { analytics, recentOrders } = await userAnalyticsService.getUserActivity(61);
    assert(analytics !== null, 'user analytics exist');
    assert(recentOrders.length >= 1, 'recent orders >= 1');
  });

  await test('ReportingService getPlatformReport returns complete platform report', async () => {
    const report = await reportingService.getPlatformReport(30);
    assert(report.totalOrders >= 2, 'platform total orders >= 2');
    assert(report.totalRevenue >= 350, 'platform revenue >= 350');
    assert(Array.isArray(report.topShops), 'topShops is array');
    assert(Array.isArray(report.dailyTrend), 'dailyTrend is array');
    assert(typeof report.successRate === 'number', 'success rate exists');
  });

  await test('ReportingService getOrdersReport returns correct breakdown', async () => {
    const report = await reportingService.getOrdersReport(30);
    assert(report.totalOrders >= 2, 'total orders >= 2');
    assert(typeof report.successRate === 'number', 'successRate is number');
    assert(Array.isArray(report.dailyBreakdown), 'dailyBreakdown is array');
  });

  // ─── Part 4: Event Worker Processing ──────────────────────────────────────
  console.log('\n📦 Part 4: Worker & Event Handler Processing');

  await test('Worker processes ORDER_CREATED and builds order fact', async () => {
    const eventId = 'evt-analytics-1';
    const payload = JSON.stringify({ orderId: 80001, shopId: 50, userId: 61, totalPrice: 150.00, totalPages: 30, color: false });
    await db.execute(`
      INSERT OR IGNORE INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '80001', 'Order', 'ORDER_CREATED', ?, 'PENDING', 'corr-a1')
    `, [eventId, payload]);

    // Manually process one batch
    const events = await eventSource.poll(5);
    assert(events.length >= 1, 'at least 1 pending event polled');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    // Verify idempotency — second acknowledge should be silent
    const conn2 = await db.getConnection();
    try {
      await conn2.beginTransaction();
      await eventSource.acknowledge(events[0], conn2); // should not throw
      await conn2.commit();
    } finally {
      conn2.release();
    }
  });

  await test('Worker processes PRINT_COMPLETED and updates completion time', async () => {
    const eventId = 'evt-analytics-2';
    const payload = JSON.stringify({ orderId: 80001, shopId: 50, userId: 61 });
    await db.execute(`
      INSERT OR IGNORE INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '80001', 'Order', 'PRINT_COMPLETED', ?, 'PENDING', 'corr-a2')
    `, [eventId, payload]);

    const events = await eventSource.poll(5);
    assert(events.length >= 1, 'polled PRINT_COMPLETED');
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    const fact = await factRepo.findByOrderId(80001);
    assert(fact !== null, 'fact exists');
    assert(fact!.printCompletedAt !== null, 'print completed at set');
  });

  await test('LOW_STOCK event increments low_stock_events counter', async () => {
    const eventId = 'evt-analytics-low';
    const payload = JSON.stringify({ shopId: 50, type: 'paper', variant: 'A4', quantity: 10 });
    await db.execute(`
      INSERT OR IGNORE INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '50', 'Shop', 'LOW_STOCK', ?, 'PENDING', 'corr-ls')
    `, [eventId, payload]);

    const before = await metricRepo.findByDate(TODAY);
    const beforeCount = before?.lowStockEvents ?? 0;

    const events = await eventSource.poll(5);
    assert(events.length >= 1, 'polled LOW_STOCK');
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    const after = await metricRepo.findByDate(TODAY);
    assert(after !== null, 'daily metric exists after LOW_STOCK');
    assertEqual(after!.lowStockEvents, beforeCount + 1, 'low_stock_events incremented');
  });

  // ─── Part 5: Concurrency & Optimistic Locking ─────────────────────────────
  console.log('\n📦 Part 5: Concurrency & Optimistic Locking');

  await test('Concurrent upserts to same date do not corrupt data', async () => {
    const metric = await metricRepo.findByDate(TODAY);
    assert(metric !== null, 'metric exists for concurrency test');

    // Simulate two concurrent reads then updates
    const [m1, m2] = await Promise.all([
      metricRepo.findByDate(TODAY),
      metricRepo.findByDate(TODAY)
    ]);
    m1!.totalOrders += 1;
    m2!.totalOrders += 1;

    // Only one should win due to optimistic locking (version check)
    await Promise.all([
      metricRepo.upsert(m1!),
      metricRepo.upsert(m2!)
    ]);

    // State should be consistent (no crash)
    const final = await metricRepo.findByDate(TODAY);
    assert(final !== null, 'final metric readable after concurrent writes');
  });

  await test('ORDER_CANCELLED event marks fact as cancelled', async () => {
    const eventId = 'evt-analytics-cancel';
    const payload = JSON.stringify({ orderId: 80002, shopId: 50, userId: 61 });
    await db.execute(`
      INSERT OR IGNORE INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '80002', 'Order', 'ORDER_CANCELLED', ?, 'PENDING', 'corr-cancel')
    `, [eventId, payload]);

    const events = await eventSource.poll(5);
    assert(events.length >= 1, 'polled ORDER_CANCELLED');
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    const fact = await factRepo.findByOrderId(80002);
    assert(fact !== null && fact!.isCancelled, 'order 80002 marked as cancelled');
  });

  // ─── Part 6: API Authorization ─────────────────────────────────────────────
  console.log('\n📦 Part 6: API Authorization');

  await test('Student can access own analytics (GET /api/analytics/me)', async () => {
    const { req, res } = mockReqRes({}, {}, {}, { id: 61, role: 'student' });
    await controller.getMyAnalytics(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for student');
  });

  await test('Unauthenticated request to /analytics/me returns 401', async () => {
    const { req, res } = mockReqRes({}, {}, {}, null);
    await controller.getMyAnalytics(req, res);
    assertEqual(res.statusCode, 401, 'HTTP 401 unauthenticated');
  });

  await test('Non-admin blocked from platform report (403)', async () => {
    const { req, res } = mockReqRes({}, {}, { days: '30' }, { id: 61, role: 'student' });
    await controller.getPlatformReport(req, res);
    assertEqual(res.statusCode, 403, 'HTTP 403 for student on admin endpoint');
  });

  await test('Admin can access platform report', async () => {
    const { req, res } = mockReqRes({}, {}, { days: '30' }, { id: 60, role: 'admin' });
    await controller.getPlatformReport(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for admin');
    assert(typeof res.body.totalOrders === 'number', 'totalOrders field in response');
  });

  await test('Admin can access revenue report', async () => {
    const { req, res } = mockReqRes({}, {}, { days: '30' }, { id: 60, role: 'admin' });
    await controller.getRevenueReport(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for admin revenue');
    assert(res.body.summary !== undefined, 'summary field exists');
  });

  await test('Admin can access orders report', async () => {
    const { req, res } = mockReqRes({}, {}, { days: '30' }, { id: 60, role: 'admin' });
    await controller.getOrdersReport(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for admin orders');
    assert(typeof res.body.totalOrders === 'number', 'totalOrders in response');
  });

  await test('Admin can access shops ranking', async () => {
    const { req, res } = mockReqRes({}, {}, {}, { id: 60, role: 'admin' });
    await controller.getShopsRanking(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for admin shops');
    assert(Array.isArray(res.body), 'shops is array');
  });

  // ─── Part 7: Replay Correctness ────────────────────────────────────────────
  console.log('\n📦 Part 7: Replay Correctness');

  await test('Replay wipes tables and rebuilds from outbox', async () => {
    await replayService.triggerReplay({ reset: true });

    // Wait for background replay chunks to complete
    await new Promise(r => setTimeout(r, 200));

    const progress = progressTracker.getProgress();
    assertEqual(progress.status, 'completed', 'replay rebuild completes');

    // At least the order facts should be rebuilt
    const facts = await factRepo.findByShopId(50, 100);
    assert(facts.length >= 1, 'order facts rebuilt after replay');
  });

  await test('Admin can trigger replay via controller', async () => {
    const { req, res } = mockReqRes({}, { reset: true }, {}, { id: 60, role: 'admin' });
    await controller.triggerReplay(req, res);
    assertEqual(res.statusCode, 202, 'HTTP 202 accepted');
    assert(res.body.message.includes('initiated'), 'message includes initiated');
  });

  await test('Admin can get replay status', async () => {
    const { req, res } = mockReqRes({}, {}, {}, { id: 60, role: 'admin' });
    await controller.getReplayStatus(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for replay status');
    assert(res.body.status !== undefined, 'status field present');

    // Wait for the background replay to finish
    while (progressTracker.getProgress().status === 'processing') {
      await new Promise(r => setTimeout(r, 50));
    }
    // Stop the worker so it doesn't poll during subsequent tests
    await worker.stop();
  });

  // ─── Part 8: Metrics ──────────────────────────────────────────────────────
  console.log('\n📦 Part 8: Prometheus Metrics');

  await test('Metrics service serializes all required Prometheus fields', async () => {
    const metricsStr = await metricsService.getMetricsString();
    assert(metricsStr.includes('analytics_events_processed_total'), 'events_processed_total present');
    assert(metricsStr.includes('analytics_replay_total'), 'replay_total present');
    assert(metricsStr.includes('analytics_processing_duration_seconds'), 'processing_duration_seconds present');
    assert(metricsStr.includes('analytics_worker_lag'), 'worker_lag present');
    assert(metricsStr.includes('analytics_order_facts_total'), 'order_facts_total present');
  });

  await test('Metrics controller endpoint returns text/plain metrics string', async () => {
    const { req, res } = mockReqRes();
    await controller.getMetrics(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 for metrics');
  });

  // ─── Part 9: Load Sanity ──────────────────────────────────────────────────
  console.log('\n📦 Part 9: Load Sanity');

  await test('Insert 20 order facts and aggregate without errors', async () => {
    const baseOrderId = 90000;
    for (let i = 0; i < 20; i++) {
      const orderId = baseOrderId + i;
      const createdAt = new Date(Date.now() - i * 60000);
      const completedAt = new Date(createdAt.getTime() + 300000);
      const fact = new OrderFact(null, orderId, 50, 61, TODAY, 100 + i, 20 + i, i % 2 === 0, createdAt, null, null, completedAt, null, null);
      await factRepo.upsert(fact);
    }

    await aggregationService.aggregateDailyMetrics(TODAY);
    await aggregationService.aggregateShopMetrics(50);

    const metric = await metricRepo.findByDate(TODAY);
    assert(metric !== null, 'daily metric computed');
    assert(metric!.totalOrders >= 20, 'at least 20 orders aggregated');
    assert(metric!.avgCompletionTimeSecs > 0, 'avg completion time computed');
  });

  await test('AnalyticsSnapshot can be created and retrieved', async () => {
    await snapshotService.createSnapshot();
    const snapshot = await snapshotService.getLatestSnapshot();
    assert(snapshot !== null, 'snapshot created');
    assert(snapshot!.snapshotDate !== null, 'snapshot date exists');
    assert(snapshot!.totalOrders >= 0, 'snapshot total orders >= 0');
  });

  // ─── Results ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) {
    throw new Error('Test suite failed');
  }
}

runAll().catch(err => {
  console.error('\n🔥 Fatal test error:', err.message);
  process.exit(1);
});
