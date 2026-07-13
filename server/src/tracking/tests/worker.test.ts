/**
 * Phase 7D — Projection Worker Processing Integration & Unit Tests
 *
 * Runs with:
 *   DB_MODE=sqlite node dist-test/tracking/tests/worker.test.js
 *
 * RFC-007 §5.3 / Phase 7D specifications
 */

// Bootstrap env
process.env['DB_MODE'] = 'sqlite';

import { ProjectionWorker } from '../worker/ProjectionWorker';
import { WorkerState } from '../worker/WorkerLifecycle';
import { OutboxProjectionEventSource } from '../infrastructure/events/OutboxProjectionEventSource';
import { ProjectionEventDispatcher } from '../application/dispatcher/ProjectionEventDispatcher';
import { ProjectionEventHandlerRegistry } from '../application/ProjectionEventHandlerRegistry';
import { EventOrderingValidator, OutOfOrderEventError } from '../application/ordering/EventOrderingValidator';
import { DeadLetterService } from '../application/dlq/DeadLetterService';
import { ProjectionUpdateService } from '../application/ProjectionUpdateService';
import { OrderCreatedProjectionHandler } from '../application/handlers/OrderCreatedProjectionHandler';
import { PaymentConfirmedProjectionHandler } from '../application/handlers/PaymentConfirmedProjectionHandler';
import { PrintJobCreatedProjectionHandler } from '../application/handlers/PrintJobCreatedProjectionHandler';

import { SqlOrderLifecycleProjectionRepository } from '../infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../infrastructure/repositories/SqlProcessedEventsRepository';

import { LifecycleState } from '../domain/enums/LifecycleState';
import { ActorType } from '../domain/enums/ActorType';
import { DomainEvent } from '../domain/events/DomainEvent';
import { ExponentialBackoff } from '../application/retry/ExponentialBackoff';
import { RetryPolicy } from '../application/retry/RetryPolicy';
import { InvalidLifecycleTransitionError } from '../domain/errors/TrackingErrors';
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
registry.register('PRINT_STARTED', new PrintJobCreatedProjectionHandler());

const dispatcher = new ProjectionEventDispatcher(registry, updateService);
const orderingValidator = new EventOrderingValidator(projRepo);
const eventSource = new OutboxProjectionEventSource();
const dlqService = new DeadLetterService(eventSource);

async function ensureSchema(): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS dead_letter_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    aggregate_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    error_message TEXT NOT NULL,
    retry_count INTEGER NOT NULL,
    failed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS outbox_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_log TEXT DEFAULT NULL,
    correlation_id TEXT NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
    worker_id TEXT DEFAULT NULL,
    processing_started_at TEXT DEFAULT NULL,
    processed_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function teardown(): Promise<void> {
  await timelineRepo.deleteAll();
  await projRepo.deleteAll();
  await processedEventsRepo.deleteAll();
  await db.execute('DELETE FROM outbox_events');
  await db.execute('DELETE FROM dead_letter_events');
}

// Helper to seed outbox table directly
async function seedOutbox(
  eventId: string,
  eventType: string,
  payload: Record<string, any>,
  version = 1,
  status = 'PENDING',
  retryCount = 0
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
      status,
      retryCount,
      'corr-test-xyz',
      version
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

async function testWorkerLifecycle(): Promise<void> {
  console.log('\n📦 Worker Lifecycle Tests');

  await test('Start, Stop, Pause, Resume states', async () => {
    const worker = new ProjectionWorker(eventSource, dispatcher, orderingValidator, dlqService, {
      pollIntervalMs: 100
    });

    assertEqual(worker.getState(), WorkerState.STOPPED, 'Initial state Stopped');

    await worker.start();
    assertEqual(worker.getState(), WorkerState.RUNNING, 'State Running');

    worker.pause();
    assertEqual(worker.getState(), WorkerState.PAUSED, 'State Paused');

    worker.resume();
    assertEqual(worker.getState(), WorkerState.RUNNING, 'State Running after resume');

    await worker.stop();
    assertEqual(worker.getState(), WorkerState.STOPPED, 'State Stopped after stop');
  });

  await test('Graceful shutdown waits for in-flight cycle to finish', async () => {
    let slowDispatcherCalled: boolean = false;
    
    // Slow dispatcher to simulate active/in-flight execution
    const slowDispatcher = new ProjectionEventDispatcher(registry, updateService);
    slowDispatcher.dispatch = async (event) => {
      slowDispatcherCalled = true;
      await new Promise(r => setTimeout(r, 200)); // sleep 200ms
      return true;
    };

    const worker = new ProjectionWorker(eventSource, slowDispatcher, orderingValidator, dlqService, {
      batchSize: 1,
      pollIntervalMs: 50,
      shutdownTimeoutMs: 1000
    });

    await seedOutbox('evt-graceful-1', 'ORDER_CREATED', {
      orderId: 3001,
      orderHash: 'hash-3001',
      studentId: 1,
      shopId: 1,
      shopName: 'Green Print',
      deliveryType: 'pickup',
      totalPrice: 100
    });

    await worker.start();
    
    // Allow cycle to start polling and executing the slow dispatcher
    await new Promise(r => setTimeout(r, 80));

    assert(slowDispatcherCalled, 'slow dispatcher should have started');

    // Trigger graceful shutdown while cycle is in-flight
    const shutdownStartTime = Date.now();
    await worker.stop();
    const shutdownDuration = Date.now() - shutdownStartTime;

    // Shutdown must wait until slow dispatcher finishes (approx 200ms - 80ms = ~120ms)
    assert(shutdownDuration >= 100, `Graceful shutdown should have waited, duration: ${shutdownDuration}ms`);
  });
}

async function testDispatcher(): Promise<void> {
  console.log('\n📦 Dispatcher Routing & Handlers');

  await test('Correct handler is selected and executed', async () => {
    const event: DomainEvent = {
      eventId: 'evt-disp-1',
      eventType: 'ORDER_CREATED',
      eventVersion: 1,
      occurredAt: new Date(),
      correlationId: 'corr',
      causationId: 'cause',
      payload: {
        orderId: 3002,
        orderHash: 'hash-3002',
        studentId: 1,
        shopId: 1,
        shopName: 'Green Print',
        deliveryType: 'pickup',
        totalPrice: 100
      }
    };

    const result = await dispatcher.dispatch(event);
    assert(result === true, 'dispatch succeeds');

    const proj = await projRepo.findByOrderId(3002);
    assert(proj !== null, 'order created successfully');
    assertEqual(proj!.shopName, 'Green Print', 'shopName matches');
  });

  await test('Missing handler is rejected with error', async () => {
    const event: DomainEvent = {
      eventId: 'evt-disp-err',
      eventType: 'UNMAPPED_RANDOM_EVENT',
      eventVersion: 1,
      occurredAt: new Date(),
      correlationId: 'corr',
      causationId: 'cause',
      payload: { orderId: 3002 }
    };

    let threw = false;
    try {
      await dispatcher.dispatch(event);
    } catch {
      threw = true;
    }
    assert(threw, 'dispatcher should fail when no handler is registered');
  });
}

async function testRetryPolicyAndBackoff(): Promise<void> {
  console.log('\n📦 Retry Policy & Backoff Calculations');

  await test('Retry delay grows exponentially with backoff calculation', async () => {
    const d0 = ExponentialBackoff.calculate(0, 1000, 30000);
    const d1 = ExponentialBackoff.calculate(1, 1000, 30000);
    const d2 = ExponentialBackoff.calculate(2, 1000, 30000);

    // Expecting approx: d0=1000+, d1=2000+, d2=4000+
    assert(d0 >= 1000 && d0 < 1200, 'Attempt 0 delay');
    assert(d1 >= 2000 && d1 < 2400, 'Attempt 1 delay');
    assert(d2 >= 4000 && d2 < 4800, 'Attempt 2 delay');
  });

  await test('Retry policy correctly classifies transient vs permanent failures', async () => {
    const invalidStateErr = new InvalidLifecycleTransitionError('DELIVERED', 'IN_PRODUCTION', 1001);
    assert(RetryPolicy.isTransient(invalidStateErr) === false, 'Transition error is permanent');

    const sqliteLockedErr = new Error('SQLITE_BUSY: database is locked');
    assert(RetryPolicy.isTransient(sqliteLockedErr) === true, 'SQLite lock error is transient');

    const genericErr = new Error('Lost connection to DB host');
    assert(RetryPolicy.isTransient(genericErr) === true, 'Generic system error is transient');
  });
}

async function testDLQ(): Promise<void> {
  console.log('\n📦 Dead Letter Queue (DLQ) Movement');

  await test('Permanent error moves event directly to DLQ and deletes from outbox', async () => {
    // Seed an outbox event
    await seedOutbox('evt-dlq-1', 'PRINT_STARTED', { orderId: 3002 }, 1, 'PENDING');
    
    // Get leased DomainEvent representation
    const polled = await eventSource.poll(1);
    assertEqual(polled.length, 1, 'event polled');

    // Send to DLQ
    const originalError = new InvalidLifecycleTransitionError('DELIVERED', 'IN_PRODUCTION', 3002);
    await dlqService.sendToDeadLetter(polled[0], originalError);

    // Verify it is written to dead_letter_events
    const [dlqRows] = await db.execute('SELECT * FROM dead_letter_events WHERE event_id = ?', ['evt-dlq-1']);
    assertEqual((dlqRows as any[]).length, 1, 'DLQ row exists');
    assert((dlqRows as any[])[0].error_message.includes('Invalid lifecycle transition'), 'contains error details');

    // Verify deleted from outbox
    const [outboxRows] = await db.execute('SELECT * FROM outbox_events WHERE event_id = ?', ['evt-dlq-1']);
    assertEqual((outboxRows as any[]).length, 0, 'deleted from outbox');
  });
}

async function testOrdering(): Promise<void> {
  console.log('\n📦 Sequence Ordering Enforcements');

  await test('Sequence gap (e.g. processing Version 3 before Version 1) throws sequence gap error', async () => {
    const event: DomainEvent = {
      eventId: 'evt-order-3',
      eventType: 'ORDER_FINALIZED',
      eventVersion: 3,
      occurredAt: new Date(),
      correlationId: 'corr',
      causationId: 'cause',
      payload: { orderId: 4001, invoiceNumber: 'INV-4001' }
    };

    let threw = false;
    try {
      await orderingValidator.assertOrdering(event);
    } catch (err: any) {
      threw = err instanceof OutOfOrderEventError;
    }
    assert(threw, 'should throw OutOfOrderEventError on missing version 1');
  });

  await test('Valid sequential versions (Version 1 -> 2) pass assertion', async () => {
    // 1. Create projection (Version 1)
    await seedOutbox('evt-ord-1', 'ORDER_CREATED', {
      orderId: 4002, orderHash: 'h-4002', studentId: 1, shopId: 1, shopName: 'Shop', deliveryType: 'pickup', totalPrice: 100
    }, 1);

    const polled = await eventSource.poll(1);
    await dispatcher.dispatch(polled[0]);

    // Current projection version is 1. Check version 2.
    const event2: DomainEvent = {
      eventId: 'evt-ord-2',
      eventType: 'ORDER_FINALIZED',
      eventVersion: 2,
      occurredAt: new Date(),
      correlationId: 'corr',
      causationId: 'cause',
      payload: { orderId: 4002, invoiceNumber: 'INV-4002' }
    };

    let threw = false;
    try {
      await orderingValidator.assertOrdering(event2);
    } catch {
      threw = true;
    }
    assert(!threw, 'sequential Version 2 should NOT throw');
  });
}

async function testConcurrencyLeasing(): Promise<void> {
  console.log('\n📦 Concurrency & Leasing Protection');

  await test('Multiple workers polling concurrently do not execute duplicate events', async () => {
    // Seed 3 events in outbox
    await seedOutbox('evt-c-1', 'ORDER_CREATED', { orderId: 5001, totalPrice: 100 }, 1);
    await seedOutbox('evt-c-2', 'ORDER_CREATED', { orderId: 5002, totalPrice: 100 }, 1);
    await seedOutbox('evt-c-3', 'ORDER_CREATED', { orderId: 5003, totalPrice: 100 }, 1);

    const src1 = new OutboxProjectionEventSource();
    const src2 = new OutboxProjectionEventSource();

    // Both poll the batch
    const poll1 = await src1.poll(10);
    const poll2 = await src2.poll(10);

    assertEqual(poll1.length, 3, 'poll1 reads 3');
    assertEqual(poll2.length, 3, 'poll2 reads 3');

    // Worker 1 leases the batch first
    await src1.lease(poll1, 10000, 'worker-1');
    assertEqual(poll1.length, 3, 'worker-1 successfully leases all 3');

    // Worker 2 attempts leasing immediately
    await src2.lease(poll2, 10000, 'worker-2');
    assertEqual(poll2.length, 0, 'worker-2 gets 0 leased events (duplicate protection)');
  });
}

async function testFullJourneyIntegration(): Promise<void> {
  console.log('\n📦 Full Journey Integration (Outbox -> Worker -> Projection)');

  await test('Seeding outbox -> Worker executes loop -> Projection updated', async () => {
    await seedOutbox('evt-j-1', 'ORDER_CREATED', {
      orderId: 6001,
      orderHash: 'hash-6001',
      studentId: 99,
      shopId: 8,
      shopName: 'Green Print',
      deliveryType: 'pickup',
      totalPrice: 1250
    }, 1);

    const worker = new ProjectionWorker(eventSource, dispatcher, orderingValidator, dlqService, {
      batchSize: 5,
      pollIntervalMs: 500,
      maxRetries: 3
    });

    // Lag must be 1 initially
    const lagBefore = await eventSource.peekLag();
    assertEqual(lagBefore, 1, ' lag count is 1');

    await worker.start();

    // Wait for worker cycle to complete processing
    await new Promise(r => setTimeout(r, 100));

    await worker.stop();

    // Verify projection exists
    const proj = await projRepo.findByOrderId(6001);
    assert(proj !== null, 'projection is created');
    assertEqual(proj!.currentState, LifecycleState.PENDING_PAYMENT, 'current state is PENDING_PAYMENT');

    // Verify outbox event is acknowledged (PROCESSED)
    const [rows] = await db.execute("SELECT status FROM outbox_events WHERE event_id = 'evt-j-1'");
    assertEqual((rows as any[])[0].status, 'PROCESSED', 'outbox status is PROCESSED');

    // Lag must be 0 now
    const lagAfter = await eventSource.peekLag();
    assertEqual(lagAfter, 0, 'lag count is 0');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Runner
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Phase 7D — Projection Worker Integration Tests         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await ensureSchema();
    await teardown();

    await testWorkerLifecycle();
    await teardown();

    await testDispatcher();
    await teardown();

    await testRetryPolicyAndBackoff();
    await teardown();

    await testDLQ();
    await teardown();

    await testOrdering();
    await teardown();

    await testConcurrencyLeasing();
    await teardown();

    await testFullJourneyIntegration();

  } catch (err: any) {
    console.error('\n💥 Fatal test execution error:', err.message);
    process.exit(1);
  }

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
}

main();
