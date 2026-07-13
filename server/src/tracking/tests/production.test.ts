/**
 * Phase 7E, 7F, 7G — Production readiness, Replay & API REST Integration Tests
 *
 * Runs with:
 *   DB_MODE=sqlite node dist-test/tracking/tests/production.test.js
 *
 * RFC-007 Phase 7E / 7F / 7G Specifications
 */

// Bootstrap env
process.env['DB_MODE'] = 'sqlite';

import { TrackingMapper } from '../api/TrackingMapper';
import { ReplayService } from '../application/replay/ReplayService';
import { ReplayRepository } from '../infrastructure/replay/ReplayRepository';
import { MetricsService } from '../application/metrics/MetricsService';
import { TrackingController } from '../api/TrackingController';
import { ProjectionWorker } from '../worker/ProjectionWorker';

import { SqlOrderLifecycleProjectionRepository } from '../infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../infrastructure/repositories/SqlProcessedEventsRepository';
import { ProjectionUpdateService } from '../application/ProjectionUpdateService';
import { ProjectionEventHandlerRegistry } from '../application/ProjectionEventHandlerRegistry';
import { ProjectionEventDispatcher } from '../application/dispatcher/ProjectionEventDispatcher';
import { EventOrderingValidator } from '../application/ordering/EventOrderingValidator';
import { DeadLetterService } from '../application/dlq/DeadLetterService';
import { OutboxProjectionEventSource } from '../infrastructure/events/OutboxProjectionEventSource';
import { OrderCreatedProjectionHandler } from '../application/handlers/OrderCreatedProjectionHandler';
import { PaymentConfirmedProjectionHandler } from '../application/handlers/PaymentConfirmedProjectionHandler';

import { OrderLifecycleProjection } from '../domain/entities/OrderLifecycleProjection';
import { TimelineEvent } from '../domain/entities/TimelineEvent';
import { LifecycleState } from '../domain/enums/LifecycleState';
import { ActorType } from '../domain/enums/ActorType';
import { DomainEvent } from '../domain/events/DomainEvent';
import db from '../../config/database';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
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

// Global Repositories
const projRepo = new SqlOrderLifecycleProjectionRepository();
const timelineRepo = new SqlTimelineEventRepository();
const processedEventsRepo = new SqlProcessedEventsRepository();
const updateService = new ProjectionUpdateService(projRepo, timelineRepo, processedEventsRepo);

// Registry & Handlers
const registry = new ProjectionEventHandlerRegistry();
registry.register('ORDER_CREATED', new OrderCreatedProjectionHandler());
registry.register('ORDER_FINALIZED', new PaymentConfirmedProjectionHandler());

const dispatcher = new ProjectionEventDispatcher(registry, updateService);
const orderingValidator = new EventOrderingValidator(projRepo);
const eventSource = new OutboxProjectionEventSource();
const dlqService = new DeadLetterService(eventSource);

const replayRepo = new ReplayRepository();

async function cleanSlate(): Promise<void> {
  await timelineRepo.deleteAll();
  await projRepo.deleteAll();
  await processedEventsRepo.deleteAll();
  await db.execute('DELETE FROM outbox_events');
  await db.execute('DELETE FROM dead_letter_events');
}

async function seedOutbox(
  eventId: string,
  eventType: string,
  payload: Record<string, any>,
  version = 1
): Promise<void> {
  await db.execute(
    `INSERT INTO outbox_events (
      event_id, event_type, aggregate_type, aggregate_id, payload, 
      status, retry_count, correlation_id, event_version, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      eventId,
      eventType,
      'ORDER',
      String(payload.orderId || 0),
      JSON.stringify(payload),
      'PENDING',
      0,
      'corr-prod-test',
      version
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

async function testMapperAndDTO(): Promise<void> {
  console.log('\n📦 Phase 7E Unit Tests: Mapper and DTOs');

  await test('Domain entities successfully map to TrackingDTO', async () => {
    const proj = new OrderLifecycleProjection(
      7001, 'hash-7001', 10, 20, 'Shop X', 'hostel', 'Block B', 4900,
      'CAPTURED', 'INV-7001', null, null, null, null, null, null, null,
      LifecycleState.CONFIRMED, 1, new Date(), 2, new Date(), new Date()
    );

    const timeline = [
      new TimelineEvent(1, 7001, 'e-1', 'ORDER_CREATED', LifecycleState.PENDING_PAYMENT, 'Created', 'Init', new Date(), ActorType.STUDENT, 10, null, 'corr-1', 'cause-1'),
      new TimelineEvent(2, 7001, 'e-2', 'ORDER_FINALIZED', LifecycleState.CONFIRMED, 'Finalized', 'Done', new Date(), ActorType.SYSTEM, null, null, 'corr-2', 'cause-2')
    ];

    const dto = TrackingMapper.toTrackingDTO(proj, timeline);
    assertEqual(dto.orderId, 7001, 'orderId');
    assertEqual(dto.currentState, LifecycleState.CONFIRMED, 'currentState');
    assertEqual(dto.timeline?.length, 2, 'timeline size');
    assertEqual(dto.timeline?.[0].state, LifecycleState.PENDING_PAYMENT, 'first timeline item state');
    assertEqual(dto.timeline?.[1].state, LifecycleState.CONFIRMED, 'second timeline item state');
  });
}

async function testMetricsAndHealth(): Promise<void> {
  console.log('\n📦 Phase 7F Unit Tests: Metrics & Health');

  await test('MetricsService records, updates, and serializes values cleanly', async () => {
    const metricsService = new MetricsService();
    metricsService.incrementProcessed(5);
    metricsService.incrementFailed(2);
    metricsService.setWorkerRunning(true);
    metricsService.setLag(10, 45);

    const raw = metricsService.getRawMetrics();
    assertEqual(raw.projection_events_processed_total, 5, 'processed count');
    assertEqual(raw.projection_events_failed_total, 2, 'failed count');
    assertEqual(raw.projection_worker_running, 1, 'worker state');
    assertEqual(raw.projection_lag_events, 10, 'lag size');

    const textFormat = metricsService.toPrometheusFormat();
    assert(textFormat.includes('projection_events_processed_total 5'), 'contains processes total in promo text');
    assert(textFormat.includes('projection_worker_running 1'), 'contains worker state in promo text');
  });

  await test('Health endpoints report UP/READY and verify db/worker conditions', async () => {
    const worker = new ProjectionWorker(eventSource, dispatcher, orderingValidator, dlqService, {
      pollIntervalMs: 50
    });
    const controller = new TrackingController(projRepo, timelineRepo, processedEventsRepo, worker);

    const mockRes = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonData = data;
        return this;
      },
      statusCode: 200,
      jsonData: null as any
    };

    await controller.getHealthReady({} as any, mockRes as any);
    assertEqual(mockRes.statusCode, 200, 'ready health HTTP code');
    assertEqual(mockRes.jsonData.status, 'READY', 'ready health status JSON');
    assertEqual(mockRes.jsonData.checks.database, 'UP', 'database check is UP');
    assertEqual(mockRes.jsonData.checks.worker, 'STOPPED', 'worker check state matches');
  });
}

async function testControllersAndAuth(): Promise<void> {
  console.log('\n📦 Phase 7E Unit Tests: Controller Authorization & Validation');

  await test('Controller rejects unauthorised requests from other students', async () => {
    // Create tracking projection for student ID 44
    const proj = new OrderLifecycleProjection(
      8001, 'hash-8001', 44, 20, 'Shop X', 'hostel', 'Block B', 4900,
      'PENDING', null, null, null, null, null, null, null, null,
      LifecycleState.PENDING_PAYMENT, 0, new Date(), 1, new Date(), new Date()
    );
    await projRepo.create(proj);

    const controller = new TrackingController(projRepo, timelineRepo, processedEventsRepo);
    
    const mockReq = {
      params: { orderId: '8001' },
      user: { id: 99, role: 'student' } // student 99 trying to read student 44's order
    };

    const mockRes = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonData = data;
        return this;
      },
      statusCode: 200,
      jsonData: null as any
    };

    await controller.getOrderTracking(mockReq as any, mockRes as any);
    assertEqual(mockRes.statusCode, 403, 'should return 403 Forbidden');
    assert(mockRes.jsonData.error.includes('Access denied'), 'contains error message');
  });

  await test('Controller rejects unauthorised requests from other shops', async () => {
    const controller = new TrackingController(projRepo, timelineRepo, processedEventsRepo);
    
    const mockReq = {
      params: { orderId: '8001' },
      user: { id: 88, role: 'shop' } // shop 88 trying to read shop 20's order
    };

    const mockRes = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonData = data;
        return this;
      },
      statusCode: 200,
      jsonData: null as any
    };

    await controller.getShopOrderTracking(mockReq as any, mockRes as any);
    assertEqual(mockRes.statusCode, 403, 'should return 403 Forbidden');
  });

  await test('Controller allows admin credentials to bypass ownership checks', async () => {
    const controller = new TrackingController(projRepo, timelineRepo, processedEventsRepo);
    
    const mockReq = {
      params: { orderId: '8001' },
      user: { id: 1, role: 'admin' } // admin bypass
    };

    const mockRes = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonData = data;
        return this;
      },
      statusCode: 200,
      jsonData: null as any
    };

    await controller.getOrderTracking(mockReq as any, mockRes as any);
    assertEqual(mockRes.statusCode, 200, 'should return 200 Ok');
    assertEqual(mockRes.jsonData.orderId, 8001, 'returns correct data');
  });
}

async function testReplaySystemFlow(): Promise<void> {
  console.log('\n📦 Phase 7F Integration Tests: Event Replay Rebuild');

  await test('ReplayService successfully resets and rebuilds projections to identical status', async () => {
    // Seed 2 outbox events representing a full order lifecycle transition
    await seedOutbox('e-rep-1', 'ORDER_CREATED', {
      orderId: 9001, orderHash: 'h-9001', studentId: 10, shopId: 5, shopName: 'Shop A', deliveryType: 'pickup', totalPrice: 1500
    }, 1);

    await seedOutbox('e-rep-2', 'ORDER_FINALIZED', {
      orderId: 9001, invoiceNumber: 'INV-9001', paymentStatus: 'CAPTURED'
    }, 2);

    // Instantiate replay pipeline
    const worker = new ProjectionWorker(eventSource, dispatcher, orderingValidator, dlqService, {
      pollIntervalMs: 500
    });

    const replayService = new ReplayService(
      replayRepo,
      projRepo,
      timelineRepo,
      processedEventsRepo,
      dispatcher,
      worker
    );

    // Trigger Replay with a full table reset
    const startProgress = await replayService.triggerReplay({ reset: true });
    assertEqual(startProgress.status, 'running', 'Replay is launched');

    // Wait for the async replay loop to finish
    await new Promise(r => setTimeout(r, 200));

    // Verify projection is rebuilt exactly
    const proj = await projRepo.findByOrderId(9001);
    assert(proj !== null, 'projection is rebuilt');
    assertEqual(proj!.currentState, LifecycleState.CONFIRMED, 'final replayed state');
    assertEqual(proj!.invoiceNumber, 'INV-9001', 'replayed invoice number');

    const timeline = await timelineRepo.findByOrderId(9001);
    assertEqual(timeline.length, 2, 'two replayed timeline events');

    const status = replayService.getReplayStatus();
    assertEqual(status.status, 'completed', 'replay state is completed');
    assertEqual(status.processedEvents, 2, 'replayed event count');
  });
}

async function testConcurrencyAndRestart(): Promise<void> {
  console.log('\n📦 Concurrency & System Crash Recovery');

  await test('Worker crash and restart recovery loop works safely without duplicates', async () => {
    const localEventSource = new OutboxProjectionEventSource(100);

    // Seed event
    await seedOutbox('evt-crash-1', 'ORDER_CREATED', {
      orderId: 9501, orderHash: 'h-9501', studentId: 10, shopId: 5, shopName: 'Shop A', deliveryType: 'pickup', totalPrice: 1500
    }, 1);

    // Simulate worker 1 polling and leasing the event
    const worker1Events = await localEventSource.poll(1);
    await localEventSource.lease(worker1Events, 100, 'worker-crash-test'); // short 100ms lease
    assertEqual(worker1Events.length, 1, 'worker-1 leased event');

    // Simulate worker 1 crashes here (never calls dispatcher/acknowledge, lease expires)
    await new Promise(r => setTimeout(r, 300)); // wait for lease to expire

    // Simulate worker 2 restarting and polling again
    const worker2Events = await localEventSource.poll(1);
    assertEqual(worker2Events.length, 1, 'worker-2 reads the event again (recovery)');
    await localEventSource.lease(worker2Events, 100, 'worker-recovery');
    
    // Process and ack
    await dispatcher.dispatch(worker2Events[0]);
    await localEventSource.acknowledge(worker2Events);

    const proj = await projRepo.findByOrderId(9501);
    assertEqual(proj!.currentState, LifecycleState.PENDING_PAYMENT, 'successfully recovered and created');
  });
}

async function testLoadPerformanceSimulation(): Promise<void> {
  console.log('\n📦 Phase 7G Performance Load Simulation');

  await test('Batch processing load rate simulation (100 events)', async () => {
    const totalEvents = 100;
    
    // Seed 100 order created events
    for (let i = 1; i <= totalEvents; i++) {
      await seedOutbox(`evt-load-${i}`, 'ORDER_CREATED', {
        orderId: 10000 + i,
        orderHash: `hash-load-${i}`,
        studentId: i,
        shopId: 1,
        shopName: 'Green Print',
        deliveryType: 'pickup',
        totalPrice: 100
      }, 1);
    }

    const worker = new ProjectionWorker(eventSource, dispatcher, orderingValidator, dlqService, {
      batchSize: 50, // Poll 50 at a time
      pollIntervalMs: 100
    });

    const startTime = Date.now();
    await worker.start();

    // Give it some time to clear the batch queue
    await new Promise(r => setTimeout(r, 600));
    await worker.stop();

    const durationMs = Date.now() - startTime;
    const finalLag = await eventSource.peekLag();
    const processed = totalEvents - finalLag;
    const throughput = (processed / (durationMs / 1000)).toFixed(2);

    console.log(`     -> Load test throughput: ${throughput} events/sec (Processed ${processed}/${totalEvents})`);
    assert(processed > 90, 'should process almost all generated events');
  });
}

async function testChaosResilience(): Promise<void> {
  console.log('\n📦 Phase 7G Chaos Recovery Tests');

  await test('Graceful error recovery: failure during transaction rolls back state', async () => {
    // Seed order created
    await seedOutbox('evt-chaos-1', 'ORDER_CREATED', {
      orderId: 20000,
      orderHash: 'hash-chaos-1',
      studentId: 1,
      shopId: 1,
      shopName: 'Shop A',
      deliveryType: 'pickup',
      totalPrice: 100
    }, 1);

    // Seed payment confirmed event but inject validation failure to trigger transaction crash
    // We try to finalize order with invalid transition to trigger rollback
    await seedOutbox('evt-chaos-2', 'ORDER_FINALIZED', {
      orderId: 20000,
      paymentStatus: 'CAPTURED',
      invoiceNumber: 'INV-20000'
    }, 3); // Gapped version 3 (version 2 missing!) to trigger OutOfOrderEventError rollback!

    const worker = new ProjectionWorker(eventSource, dispatcher, orderingValidator, dlqService, {
      batchSize: 10,
      pollIntervalMs: 50,
      maxRetries: 1
    });

    await worker.start();
    await new Promise(r => setTimeout(r, 200));
    await worker.stop();

    // Verify ordering validation rolled back:
    // Projection should exist in state 1 (PENDING_PAYMENT, version 1)
    const proj = await projRepo.findByOrderId(20000);
    assert(proj !== null, 'order created');
    assertEqual(proj!.currentState, LifecycleState.PENDING_PAYMENT, 'state is PENDING_PAYMENT (payment event rolled back)');
    assertEqual(proj!.version, 1, 'projection version is 1');

    // Event 2 should be moved to the Dead Letter Queue
    const [dlqRows] = await db.execute("SELECT error_message FROM dead_letter_events WHERE event_id = 'evt-chaos-2'");
    assertEqual((dlqRows as any[]).length, 1, 'Event 2 should be moved to DLQ');
    assert((dlqRows as any[])[0].error_message.includes('Out of order event'), 'contains sequence gap details');

    // And removed from outbox
    const [outboxRows] = await db.execute("SELECT status FROM outbox_events WHERE event_id = 'evt-chaos-2'");
    assertEqual((outboxRows as any[]).length, 0, 'Event 2 should be deleted from outbox');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Runner
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Phase 7E, 7F, 7G — Production Readiness Test Suite     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await cleanSlate();

    await testMapperAndDTO();
    await cleanSlate();

    await testMetricsAndHealth();
    await cleanSlate();

    await testControllersAndAuth();
    await cleanSlate();

    await testReplaySystemFlow();
    await cleanSlate();

    await testConcurrencyAndRestart();
    await cleanSlate();

    await testLoadPerformanceSimulation();
    await cleanSlate();

    await testChaosResilience();

  } catch (err: any) {
    console.error('\n💥 Fatal test execution error:', err.stack || err.message);
    process.exit(1);
  }

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
}

main();
