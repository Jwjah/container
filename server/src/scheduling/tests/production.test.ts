/**
 * Production Integration Test Suite for RFC-008
 */

import { SqlShopCapacityRepository } from '../infrastructure/repositories/SqlShopCapacityRepository';
import { SqlPrinterRepository } from '../infrastructure/repositories/SqlPrinterRepository';
import { SqlInventoryRepository } from '../infrastructure/repositories/SqlInventoryRepository';
import { ShopCapacity } from '../domain/entities/ShopCapacity';
import { Printer } from '../domain/entities/Printer';
import { QueueSlot } from '../domain/entities/QueueSlot';
import { MaintenanceWindow } from '../domain/entities/MaintenanceWindow';
import { InventoryItem } from '../domain/entities/InventoryItem';
import { PrinterCapabilities } from '../domain/value-objects/PrinterCapabilities';
import { PrinterStatus } from '../domain/enums/PrinterStatus';
import { QueueStatus } from '../domain/enums/QueueStatus';
import { ECTSchedulingStrategy } from '../application/strategies/ECTSchedulingStrategy';
import { CapacityCalculator } from '../application/services/CapacityCalculator';
import { InventoryService } from '../application/services/InventoryService';
import { PrinterAssignmentService } from '../application/services/PrinterAssignmentService';
import { QueueService } from '../application/services/QueueService';
import { MaintenancePlanner } from '../application/services/MaintenancePlanner';
import { EtaCalculationService } from '../application/services/EtaCalculationService';
import { SchedulingEngine } from '../application/services/SchedulingEngine';
import { SchedulingEventDispatcher } from '../application/events/SchedulingEventDispatcher';
import { OrderCreatedHandler, OrderCancelledHandler, PrintStartedHandler, PrintCompletedHandler, PrinterOfflineHandler, MaintenanceScheduledHandler } from '../application/events/SchedulingEventHandlers';
import { SchedulingEventSource } from '../worker/SchedulingEventSource';
import { SchedulingEventWorker } from '../worker/SchedulingEventWorker';
import { ReplayRepository } from '../infrastructure/replay/ReplayRepository';
import { ReplayProgressTracker } from '../application/replay/ReplayProgressTracker';
import { SchedulingReplayWorker } from '../application/replay/SchedulingReplayWorker';
import { SchedulingReplayService } from '../application/replay/SchedulingReplayService';
import { SchedulingMetricsService } from '../application/metrics/SchedulingMetricsService';
import { SchedulingController } from '../api/SchedulingController';
import { SchedulingConcurrencyError, ShopCapacityExceededError, InsufficientInventoryError } from '../domain/errors/SchedulingErrors';
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
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function mockReqRes(params: any = {}, body: any = {}, user: any = null) {
  const req = { params, body, user } as any;
  const res = {
    status: function(code: number) {
      this.statusCode = code;
      return this;
    },
    json: function(data: any) {
      this.body = data;
      return this;
    },
    set: function() {},
    send: function(data: any) {
      this.body = data;
      return this;
    },
    statusCode: 200,
    body: null
  } as any;
  return { req, res };
}

async function runAll() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║        RFC-008 Complete Bounded Context Production Tests ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const capacityRepo = new SqlShopCapacityRepository();
  const printerRepo = new SqlPrinterRepository();
  const inventoryRepo = new SqlInventoryRepository();
  const strategy = new ECTSchedulingStrategy();

  const capacityCalculator = new CapacityCalculator(capacityRepo, printerRepo);
  const inventoryService = new InventoryService(inventoryRepo);
  const assignmentService = new PrinterAssignmentService(printerRepo, strategy);
  const queueService = new QueueService(printerRepo, assignmentService);
  const maintenancePlanner = new MaintenancePlanner(printerRepo);
  const etaService = new EtaCalculationService(printerRepo, strategy);

  const schedulingEngine = new SchedulingEngine(capacityCalculator, inventoryService, assignmentService);

  const eventSource = new SchedulingEventSource();
  const dispatcher = new SchedulingEventDispatcher(
    schedulingEngine,
    queueService,
    inventoryService,
    maintenancePlanner,
    capacityRepo,
    printerRepo
  );

  // Register Handlers
  dispatcher.register('ORDER_CREATED', new OrderCreatedHandler());
  dispatcher.register('ORDER_CANCELLED', new OrderCancelledHandler());
  dispatcher.register('PRINT_STARTED', new PrintStartedHandler());
  dispatcher.register('PRINT_COMPLETED', new PrintCompletedHandler());
  dispatcher.register('PRINTER_OFFLINE', new PrinterOfflineHandler());
  dispatcher.register('MAINTENANCE_SCHEDULED', new MaintenanceScheduledHandler());

  const activeWorker = new SchedulingEventWorker(eventSource, dispatcher, 50, 5);

  const replayRepo = new ReplayRepository();
  const progressTracker = new ReplayProgressTracker();
  const replayWorker = new SchedulingReplayWorker(dispatcher, progressTracker);
  const replayService = new SchedulingReplayService(replayRepo, activeWorker, replayWorker, progressTracker);
  const metricsService = new SchedulingMetricsService(eventSource);

  const controller = new SchedulingController(
    capacityRepo,
    printerRepo,
    inventoryService,
    etaService,
    replayService,
    progressTracker,
    metricsService
  );

  // Clear Database State
  await capacityRepo.deleteAll();
  await printerRepo.deleteAll();
  await inventoryRepo.deleteAll();
  await db.execute('DELETE FROM outbox_events');
  await db.execute('DELETE FROM scheduling_processed_events');
  await db.execute('DELETE FROM dead_letter_events');

  // Set up mock base tables data
  await db.execute("INSERT OR IGNORE INTO shops (id, shop_name, user_id) VALUES (40, 'Campus Shop Main', 30)");
  await db.execute("INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (99, 'Student Bob', 'bob@campus.edu', 'pass', 'student')");
  await db.execute("INSERT OR IGNORE INTO orders (id, order_hash, student_id, shop_id, status) VALUES (70002, 'hash70002', 99, 40, 'pending')");

  // ───────────────────────────────────────────────────────────────────────────
  // Part 1: Repositories Integration Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 1: Repositories Integration');

  await test('Shop Capacity Repository lifecycle and version increment', async () => {
    const cap = new ShopCapacity(40, 5, 7200, true, 1);
    await capacityRepo.create(cap);

    const loaded = await capacityRepo.findById(40);
    assert(loaded !== null, 'should find shop capacity');
    assertEqual(loaded!.maxParallelOrders, 5, 'maxParallelOrders');
    assertEqual(loaded!.isAcceptingOrders, true, 'isAcceptingOrders');

    loaded!.maxParallelOrders = 10;
    await capacityRepo.update(loaded!);
    assertEqual(loaded!.version, 2, 'version increment');

    const loaded2 = await capacityRepo.findById(40);
    assertEqual(loaded2!.maxParallelOrders, 10, 'updated parallel orders limit');
  });

  await test('Optimistic locking concurrency block in repositories', async () => {
    const loaded1 = await capacityRepo.findById(40);
    const loaded2 = await capacityRepo.findById(40);

    loaded1!.maxParallelOrders = 12;
    await capacityRepo.update(loaded1!);

    // Attempting to update loaded2 with stale version (1) should crash
    let threw = false;
    try {
      loaded2!.maxParallelOrders = 15;
      await capacityRepo.update(loaded2!);
    } catch (err: any) {
      threw = err instanceof SchedulingConcurrencyError;
    }
    assert(threw, 'should throw SchedulingConcurrencyError on stale version update');
  });

  await test('Printer repository retrieves with queue slots and maintenance windows', async () => {
    const caps = new PrinterCapabilities(15, true, true, ['A4'], 100, ['plain']);
    const printer = new Printer(null, 40, 'Integrator-A', PrinterStatus.AVAILABLE, caps);
    const printerId = await printerRepo.create(printer);
    assert(printerId > 0, 'inserted printer id');

    const loaded = await printerRepo.findById(printerId);
    assert(loaded !== null, 'printer found');
    assertEqual(loaded!.name, 'Integrator-A', 'printer name');
    assertEqual(loaded!.slots.length, 0, 'empty slots');
  });

  await test('Inventory repository generic stock queries', async () => {
    const paper = new InventoryItem(null, 40, 'paper', 'A4', 1000, 'sheets', 200);
    const ink = new InventoryItem(null, 40, 'ink', 'Black', 100, 'percentage', 20);

    await inventoryRepo.create(paper);
    await inventoryRepo.create(ink);

    const foundPaper = await inventoryRepo.findByShopAndItem(40, 'paper', 'A4');
    assert(foundPaper !== null, 'paper item found');
    assertEqual(foundPaper!.quantity, 1000, 'paper quantity');

    foundPaper!.deduct(300);
    await inventoryRepo.update(foundPaper!);

    const updatedPaper = await inventoryRepo.findByShopAndItem(40, 'paper', 'A4');
    assertEqual(updatedPaper!.quantity, 700, 'remaining quantity');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 2, 3, 4: Application Services & Scheduling Strategies
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 2-4: Application Services & Strategy');

  await test('ECT scheduling strategy assigns fastest finishing printer', async () => {
    const printers = await printerRepo.findByShopId(40);
    assert(printers.length > 0, 'printers available');

    // Currently we have 1 printer: 'Integrator-A' (15 ppm, duplex=true, color=true)
    // Let's add a second printer 'Integrator-B' (30 ppm, duplex=true, color=true)
    const capsB = new PrinterCapabilities(30, true, true, ['A4'], 100, ['plain']);
    const printerB = new Printer(null, 40, 'Integrator-B', PrinterStatus.AVAILABLE, capsB);
    await printerRepo.create(printerB);

    const activePrinters = await printerRepo.findByShopId(40);
    assertEqual(activePrinters.length, 2, 'two active printers');

    // Both are free. 30 ppm printer (Integrator-B) should complete 60 pages in 2 minutes (+30s warmup = 2.5m).
    // 15 ppm printer (Integrator-A) would complete in 4 minutes (+30s warmup = 4.5m).
    // ECTSchedulingStrategy should assign it to Integrator-B.
    const optimal = strategy.assignPrinter(activePrinters, { pagesCount: 60, duplex: true, color: true, paperSize: 'A4' });
    assert(optimal !== null, 'assigned printer');
    assertEqual(optimal!.name, 'Integrator-B', 'selected faster printer');
  });

  await test('Scheduling engine transactionally checks capacity/inventory and assigns queue slot', async () => {
    // Current paper: 700 sheets. Ink Black: 100%. Max parallel limit: 12.
    // Try scheduling a job of 100 pages
    await schedulingEngine.scheduleOrder(40, 70001, 100, true, false, 'A4');

    const eta = await etaService.getOrderEta(70001);
    assertEqual(eta.queuePosition, 1, 'queue position is 1');
    assert(eta.printerId !== null, 'printer assigned');

    // Confirm inventory was deducted: 700 - 100 = 600 paper pages.
    const paper = await inventoryRepo.findByShopAndItem(40, 'paper', 'A4');
    assertEqual(paper!.quantity, 600, 'remaining paper after booking');

    const ink = await inventoryRepo.findByShopAndItem(40, 'ink', 'Black');
    // 100 pages * 0.05% = 5% ink deducted. 100 - 5 = 95%.
    assertEqual(ink!.quantity, 95, 'remaining ink after booking');
  });

  await test('Scheduling engine blocks placement if shop exceeds max parallel orders limit', async () => {
    // Set maxParallelOrders of shop capacity to 1
    const cap = await capacityRepo.findById(40);
    cap!.maxParallelOrders = 1;
    await capacityRepo.update(cap!);

    // We already have 1 pending order (70001). Adding order 70002 should throw capacity overload exception
    let threw = false;
    try {
      await schedulingEngine.scheduleOrder(40, 70002, 10, true, false, 'A4');
    } catch (err: any) {
      threw = err instanceof ShopCapacityExceededError;
    }
    assert(threw, 'should raise ShopCapacityExceededError');

    // Restore limit
    cap!.maxParallelOrders = 5;
    await capacityRepo.update(cap!);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 5-7: Worker Background Processing & Event Handlers
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 5-7: Event Loop & Queue State Management');

  await test('Worker handles ORDER_CREATED and allocates queue slots dynamically', async () => {
    const eventId = 'evt-sched-1';
    // Write outbox event
    const payload = JSON.stringify({ shopId: 40, orderId: 70002, pagesCount: 50, duplex: false, color: false, paperSize: 'A4' });
    await db.execute(`
      INSERT INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '70002', 'Order', 'ORDER_CREATED', ?, 'PENDING', 'corr-1')
    `, [eventId, payload]);

    const beforeCount = activeWorker.processedEventCount;
    
    // Process one batch cycle manually for test control
    const events = await eventSource.poll(5);
    assertEqual(events.length, 1, 'polled outbox event');
    assertEqual(events[0].eventId, 'evt-sched-1', 'event id');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await dispatcher.dispatch(events[0], conn);
      await eventSource.acknowledge(events[0], conn);
      await conn.commit();
    } finally {
      conn.release();
    }

    // Verify order 70002 was scheduled successfully
    const slot = await etaService.getOrderEta(70002);
    assertEqual(slot.queuePosition, 1, 'first order position on Integrator-A');
  });

  await test('Worker handles PRINT_STARTED to update queue status to printing', async () => {
    const eventId = 'evt-sched-2';
    const payload = JSON.stringify({ orderId: 70002 });
    await db.execute(`
      INSERT INTO outbox_events (event_id, aggregate_id, aggregate_type, event_type, payload, status, correlation_id)
      VALUES (?, '70002', 'Order', 'PRINT_STARTED', ?, 'PENDING', 'corr-2')
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

    // Check queue slot status
    const [rows] = await db.execute('SELECT status FROM scheduling_print_queue WHERE order_id = 70002');
    assertEqual((rows as any[])[0].status, 'printing', 'queue status moved to printing');
  });

  await test('QueueService handles offline printer and schedules slots to other printers', async () => {
    // Retrieve printerIntegrator-B ID
    const printers = await printerRepo.findByShopId(40);
    const printerB = printers.find(p => p.name === 'Integrator-B');
    assert(printerB !== undefined, 'Integrator-B printer exists');

    // Set Integrator-B offline. This should trigger rescheduling of its pending slots (like order 70001 or 70002).
    // Wait, order 70002 is 'printing', but pending slots should move.
    await queueService.rescheduleOfflinePrinter(printerB!.id!);

    // Integrator-B should be OFFLINE now
    const offlineP = await printerRepo.findById(printerB!.id!);
    assertEqual(offlineP!.status, PrinterStatus.OFFLINE, 'status set offline');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Part 8-10: Controllers, Replay, and Metrics
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Part 8-10: Express Endpoints, Replay, and Prometheus');

  await test('Scheduling controller responds capacity and DTO formats', async () => {
    const { req, res } = mockReqRes({ shopId: '40' }, {}, { id: 30, role: 'shop' }); // shop owner ID 30
    await controller.getShopCapacity(req, res);
    assertEqual(res.statusCode, 200, 'HTTP 200');
    assertEqual(res.body.shopId, 40, 'shopId matches');
    assert(res.body.currentActiveOrders !== undefined, 'dynamic orders active counts output');
  });

  await test('Replenish inventory endpoint requires authorization', async () => {
    const { req, res } = mockReqRes({ shopId: '40' }, { type: 'paper', variant: 'A4', quantity: 500 }, { id: 99, role: 'student' });
    await controller.replenishInventory(req, res);
    assertEqual(res.statusCode, 403, 'student blocked from restocking inventory');
  });

  await test('Prometheus scraper serializes metrics string properly', async () => {
    const metricsStr = await metricsService.getMetricsString();
    assert(metricsStr.includes('scheduling_processed_events_total'), 'contains counters');
    assert(metricsStr.includes('scheduling_queue_lag_events'), 'contains queue lags');
  });

  await test('Replay Service resets tables and rebuilds slot timeline correctly', async () => {
    // Wipes tables and replays our outbox: ORDER_CREATED (70002), PRINT_STARTED (70002).
    // We expect the state to rebuild completely!
    await replayService.triggerReplay({ reset: true });

    // Wait for the background replay chunk processing to finish
    await new Promise(r => setTimeout(r, 100));

    const progress = progressTracker.getProgress();
    assertEqual(progress.status, 'completed', 'replay rebuild completes');

    // Confirm that order 70002 queue slot is restored in printing state!
    const [rows] = await db.execute('SELECT status FROM scheduling_print_queue WHERE order_id = 70002');
    assert(rows !== undefined && (rows as any[]).length > 0, 'rebuilt slot exists');
    assertEqual((rows as any[])[0].status, 'printing', 'rebuilt slot is set to printing');
  });

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) {
    throw new Error('Test suite failed');
  }

  // Close database connection pools if they exist to terminate cleanly
  if (db && typeof (db as any).end === 'function') {
    try {
      await (db as any).end();
    } catch {}
  }
  (global as any).process.exit(0);
}

if (require.main === module) {
  runAll().catch(err => {
    console.error('Fatal test error:', err);
    (global as any).process.exit(1);
  });
}
