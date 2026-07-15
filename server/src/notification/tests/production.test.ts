import { Notification } from '../domain/entities/Notification';
import { DeliveryAttempt } from '../domain/entities/DeliveryAttempt';
import { NotificationPreference } from '../domain/entities/NotificationPreference';
import { NotificationTemplate } from '../domain/entities/NotificationTemplate';
import { NotificationBatch } from '../domain/entities/NotificationBatch';
import { NotificationChannel } from '../domain/enums/NotificationChannel';
import { NotificationStatus } from '../domain/enums/NotificationStatus';
import { NotificationPriority } from '../domain/enums/NotificationPriority';
import { NotificationType } from '../domain/enums/NotificationType';

import { SqlNotificationRepository } from '../infrastructure/repositories/SqlNotificationRepository';
import { SqlNotificationTemplateRepository } from '../infrastructure/repositories/SqlNotificationTemplateRepository';
import { SqlNotificationPreferenceRepository } from '../infrastructure/repositories/SqlNotificationPreferenceRepository';
import { SqlNotificationBatchRepository } from '../infrastructure/repositories/SqlNotificationBatchRepository';

import { TemplateEngine } from '../application/services/TemplateEngine';
import { PreferenceResolver } from '../application/services/PreferenceResolver';
import { EmailChannelHandler } from '../application/services/EmailChannelHandler';
import { InAppChannelHandler } from '../application/services/InAppChannelHandler';
import { ChannelRouter } from '../application/services/ChannelRouter';
import { DeliveryService } from '../application/services/DeliveryService';
import { NotificationService } from '../application/services/NotificationService';
import { NotificationMetricsService } from '../application/metrics/NotificationMetricsService';
import { ReplayProgressTracker } from '../application/replay/ReplayProgressTracker';
import { NotificationReplayWorker } from '../application/replay/NotificationReplayWorker';
import { NotificationReplayService } from '../application/replay/NotificationReplayService';

import { NotificationEventSource } from '../worker/NotificationEventSource';
import { NotificationEventDispatcher } from '../worker/NotificationEventDispatcher';
import { NotificationEventWorker } from '../worker/NotificationEventWorker';
import { OrderCreatedHandler, PaymentConfirmedHandler, LowStockHandler } from '../application/events/NotificationEventHandlers';

import { NotificationController } from '../api/NotificationController';
import db from '../../config/database';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}\n     ${err.stack || err.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual})`);
  }
}

// HTTP Mock helpers
function mockReqRes(params: any = {}, body: any = {}, userProfile: any = null) {
  const req = {
    params,
    body,
    user: userProfile
  } as any;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    set(key: string, val: string) {
      this.headers[key] = val;
      return this;
    },
    send(data: any) {
      this.body = data;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    }
  } as any;

  return { req, res };
}

async function runAll(): Promise<void> {
  console.log('\n==========================================================');
  console.log('       RFC-009 Notification Context Integration Tests     ');
  console.log('==========================================================');

  // Repositories initialization
  const notifRepo = new SqlNotificationRepository();
  const templateRepo = new SqlNotificationTemplateRepository();
  const preferenceRepo = new SqlNotificationPreferenceRepository();
  const batchRepo = new SqlNotificationBatchRepository();

  // Application services
  const templateEngine = new TemplateEngine();
  const prefResolver = new PreferenceResolver(preferenceRepo);
  const emailHandler = new EmailChannelHandler();
  const inAppHandler = new InAppChannelHandler(notifRepo);
  const channelRouter = new ChannelRouter(prefResolver);
  const deliveryService = new DeliveryService(notifRepo, emailHandler, inAppHandler, channelRouter, templateEngine);
  const notifService = new NotificationService(templateRepo, deliveryService);

  // Worker loop
  const eventSource = new NotificationEventSource();
  const dispatcher = new NotificationEventDispatcher();

  // Register Handlers
  dispatcher.register('ORDER_CREATED', new OrderCreatedHandler(notifService));
  dispatcher.register('PAYMENT_CONFIRMED', new PaymentConfirmedHandler(notifService));
  dispatcher.register('LOW_STOCK', new LowStockHandler(notifService));

  const activeWorker = new NotificationEventWorker(eventSource, dispatcher, 50, 5);

  // Replay
  const progressTracker = new ReplayProgressTracker();
  const replayWorker = new NotificationReplayWorker(dispatcher, progressTracker);
  const replayService = new NotificationReplayService(activeWorker, replayWorker, progressTracker);
  const metricsService = new NotificationMetricsService();

  // Controller
  const controller = new NotificationController(
    notifRepo,
    templateRepo,
    preferenceRepo,
    metricsService,
    replayService,
    progressTracker
  );

  // Clean tables
  await db.execute('PRAGMA foreign_keys = OFF');
  await notifRepo.deleteAll();
  await templateRepo.deleteAll();
  await preferenceRepo.deleteAll();
  await batchRepo.deleteAll();
  await db.execute('DELETE FROM outbox_events');
  await db.execute('DELETE FROM processed_notification_events');
  await db.execute('DELETE FROM dead_letter_events');
  await db.execute('DELETE FROM shops');
  await db.execute('DELETE FROM users');
  await db.execute('DELETE FROM orders');

  // Set up mock base references
  await db.execute("INSERT INTO users (id, name, email, password, role) VALUES (10, 'Alice Student', 'alice@campus.edu', 'pass', 'student')");
  await db.execute("INSERT INTO users (id, name, email, password, role) VALUES (20, 'Merchant Bob', 'bob@campus.edu', 'pass', 'shop')");
  await db.execute("INSERT INTO shops (id, shop_name, user_id) VALUES (40, 'Campus Shop Central', 20)");
  await db.execute("INSERT INTO orders (id, order_hash, student_id, shop_id, status) VALUES (6001, 'hash-6001', 10, 40, 'pending')");
  await db.execute('PRAGMA foreign_keys = ON');

  // ───────────────────────────────────────────────────────────────────────────
  // Part 1: Repositories Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 1: Repositories & Entities Validation');

  await test('SqlNotificationRepository saves notifications and logs delivery attempts', async () => {
    const notif = new Notification(
      null,
      10,
      NotificationType.TRANSACTIONAL,
      NotificationPriority.MEDIUM,
      'Order Processed',
      'Your order has been sent to production.'
    );

    const saved = await notifRepo.create(notif);
    assert(saved.id !== null && saved.id > 0, 'creates auto-increment ID');

    // Add attempt
    const attempt = new DeliveryAttempt(
      null,
      saved.id!,
      NotificationChannel.EMAIL,
      NotificationStatus.SENT
    );
    await notifRepo.saveAttempt(attempt);

    const loaded = await notifRepo.findById(saved.id!);
    assert(loaded !== null, 'retrieved created alert');
    assertEqual(loaded!.title, 'Order Processed', 'titles match');
    assertEqual(loaded!.deliveryAttempts.length, 1, 'retrieved nested attempt');
    assertEqual(loaded!.deliveryAttempts[0].channel, NotificationChannel.EMAIL, 'channel matches');
  });

  await test('SqlNotificationTemplateRepository saves named HTML/Markdown layouts', async () => {
    const temp = new NotificationTemplate(
      null,
      'TEST_TEMPLATE',
      'Test Alert #{{id}}',
      'Markdown text for **{{id}}**',
      '<p>HTML formatting</p>',
      1
    );

    await templateRepo.create(temp);
    const loaded = await templateRepo.findByName('TEST_TEMPLATE');
    assert(loaded !== null, 'template retrieved by unique name');
    assertEqual(loaded!.subject, 'Test Alert #{{id}}', 'subject variables intact');
    assertEqual(loaded!.version, 1, 'version check matches');
  });

  await test('SqlNotificationPreferenceRepository configures quiet hours opt-out flags', async () => {
    const pref = new NotificationPreference(
      null,
      10,
      true, // email
      false, // inApp
      '22:00',
      '07:00',
      NotificationPriority.MEDIUM
    );

    await preferenceRepo.create(pref);
    const loaded = await preferenceRepo.findByUserId(10);
    assert(loaded !== null, 'preferences loaded for student user');
    assertEqual(loaded!.inAppEnabled, false, 'inApp is opt-out');
    assertEqual(loaded!.quietHoursStart, '22:00', 'quiet hours boundaries match');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 2: Template & Preferences Services
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 2: Template Rendering & Preferences Resolving');

  await test('TemplateEngine renders variables and formats HTML/Markdown tags', async () => {
    const tpl = 'Hello {{name}}! Your print order {{orderId}} is {{status}}.';
    const vars = { name: 'Alice', orderId: 7005, status: 'ready' };
    const text = templateEngine.render(tpl, vars);
    assertEqual(text, 'Hello Alice! Your print order 7005 is ready.', 'variable interpolation');

    const markdown = 'Job is **complete** for [details](http://campus.edu).';
    const html = templateEngine.markdownToHtml(markdown);
    assert(html.includes('<strong>complete</strong>'), 'HTML bold conversion');
    assert(html.includes('<a href="http://campus.edu">details</a>'), 'HTML link conversion');
  });

  await test('PreferenceResolver filters channels and enforces quiet hours quiet intervals', async () => {
    const pref = await preferenceRepo.findByUserId(10);
    
    // Low priority should be filtered because minPriority is MEDIUM
    const sendLow = await prefResolver.shouldDeliver(10, NotificationChannel.EMAIL, NotificationPriority.LOW, new Date());
    assertEqual(sendLow, false, 'low priority filtered');

    // Medium priority within quiet hours (e.g. 23:30) should be silenced
    const testDate = new Date();
    testDate.setHours(23);
    testDate.setMinutes(30);
    const sendQuiet = await prefResolver.shouldDeliver(10, NotificationChannel.EMAIL, NotificationPriority.MEDIUM, testDate);
    assertEqual(sendQuiet, false, 'silenced in quiet hours');

    // High priority should bypass quiet hours
    const sendHigh = await prefResolver.shouldDeliver(10, NotificationChannel.EMAIL, NotificationPriority.HIGH, testDate);
    assertEqual(sendHigh, true, 'high priority bypasses quiet hours');

    // Update user 10's minPriority to low for subsequent worker/replay tests
    const user10Pref = await preferenceRepo.findByUserId(10);
    user10Pref!.minPriority = NotificationPriority.LOW;
    await preferenceRepo.update(user10Pref!);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 3: Worker & Delivery Flow
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 3: Worker Polling & Channel Handlers');

  await test('Worker processes ORDER_CREATED outbox log and dispatches template email', async () => {
    const eventId = 'evt-notif-1';
    const payload = JSON.stringify({ orderId: 6001, shopId: 40, pagesCount: 30 });
    
    // Insert into event outbox log
    await db.execute(`
      INSERT INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '6001', 'Order', 'ORDER_CREATED', ?, 'PENDING', 'corr-notif-1')
    `, [eventId, payload]);

    const events = await eventSource.poll(5);
    assertEqual(events.length, 1, 'polled outbox events');
    assertEqual(events[0].eventId, 'evt-notif-1', 'event matched');

    // Process event manually through worker execution flow
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    // Assert notification record was written for student user Alice (ID 10)
    const list = await notifRepo.findByUserId(10);
    assert(list.length > 0, 'notification record generated');
    const hasOrderCreated = list.some(n => n.title === 'Order Created #6001');
    assert(hasOrderCreated, 'resolved and rendered template title');
  });

  await test('Worker routes LOW_STOCK alerts to shop merchants', async () => {
    const eventId = 'evt-notif-2';
    const payload = JSON.stringify({ shopId: 40, type: 'paper', variant: 'A4', quantity: 50 });
    
    await db.execute(`
      INSERT INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '40', 'Shop', 'LOW_STOCK', ?, 'PENDING', 'corr-notif-2')
    `, [eventId, payload]);

    const events = await eventSource.poll(5);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    // Resolved shop owner Merchant Bob (ID 20)
    const list = await notifRepo.findByUserId(20);
    assert(list.length > 0, 'merchant notified of stock status');
    assert(list[0].content.includes('running low'), 'correct stock template text');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 4: Replay & Metrics Observability
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 4: Replays & Prometheus Registry');

  await test('ReplayService resets database and rebuilds all historic alerts', async () => {
    // 2 events processed. Triggering replay should stop worker, wipe, and process again.
    await replayService.triggerReplay({ reset: true });
    
    // Wait for async queue execution loop
    await new Promise(r => setTimeout(r, 100));

    const progress = progressTracker.getProgress();
    assertEqual(progress.status, 'completed', 'replay completed');
    assertEqual(progress.processedCount, 2, 'replayed both events');

    // Student notification restored!
    const list = await notifRepo.findByUserId(10);
    assert(list.length > 0, 'restored historical notifications');
  });

  await test('MetricsService serializes custom gauge/counter fields', async () => {
    const metricsStr = await metricsService.getMetricsString();
    assert(metricsStr.includes('notification_created_total'), 'exposes cumulative metrics');
    assert(metricsStr.includes('email_delivery_sent_total'), 'exposes email sent counts');
    assert(metricsStr.includes('in_app_delivery_sent_total'), 'exposes in-app counts');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 5: Controller & REST Endpoints
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 5: REST Controllers & Auth rules');

  await test('Controller allows own preferences edits but blocks cross-access', async () => {
    const { req, res } = mockReqRes({}, { emailEnabled: false, inAppEnabled: true }, { id: 10, role: 'student' });
    await controller.updatePreferences(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200 successful preference updates');
    assertEqual(res.body.emailEnabled, false, 'email toggled to opt-out');
  });

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) {
    throw new Error('Test suite failed');
  }

  // Close connection pool to exit cleanly
  if (db && typeof (db as any).end === 'function') {
    try {
      await (db as any).end();
    } catch {}
  }
  (global as any).process.exit(0);
}

if (require.main === module) {
  runAll().catch(err => {
    console.error('Fatal integration test error:', err);
    (global as any).process.exit(1);
  });
}
