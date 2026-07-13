/**
 * Phase 7C — Application Layer Integration & Unit Tests
 *
 * Runs with:
 *   DB_MODE=sqlite node dist-test/tracking/tests/application.test.js
 *
 * RFC-007 §5.3 / Phase 7C specifications
 */

// Bootstrap env before database initializes
process.env['DB_MODE'] = 'sqlite';

import { LifecycleStateMapper } from '../application/LifecycleStateMapper';
import { ProjectionUpdateService } from '../application/ProjectionUpdateService';
import { ProjectionEventHandlerRegistry } from '../application/ProjectionEventHandlerRegistry';
import { OrderCreatedProjectionHandler } from '../application/handlers/OrderCreatedProjectionHandler';
import { PaymentConfirmedProjectionHandler } from '../application/handlers/PaymentConfirmedProjectionHandler';
import { PrintJobCreatedProjectionHandler } from '../application/handlers/PrintJobCreatedProjectionHandler';
import { PrintReadyProjectionHandler } from '../application/handlers/PrintReadyProjectionHandler';
import { DeliveryAssignedProjectionHandler } from '../application/handlers/DeliveryAssignedProjectionHandler';
import { OrderCompletedProjectionHandler } from '../application/handlers/OrderCompletedProjectionHandler';

import { SqlOrderLifecycleProjectionRepository } from '../infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../infrastructure/repositories/SqlProcessedEventsRepository';

import { LifecycleState } from '../domain/enums/LifecycleState';
import { ActorType } from '../domain/enums/ActorType';
import { DomainEvent } from '../domain/events/DomainEvent';
import { UnsupportedLifecycleEventError, InvalidLifecycleTransitionError, ProjectionConcurrencyError } from '../domain/errors/TrackingErrors';
import db from '../../config/database';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
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

// Repositories
const projRepo = new SqlOrderLifecycleProjectionRepository();
const timelineRepo = new SqlTimelineEventRepository();
const processedEventsRepo = new SqlProcessedEventsRepository();

// Service under test
const updateService = new ProjectionUpdateService(
  projRepo,
  timelineRepo,
  processedEventsRepo
);

// Registry
const registry = new ProjectionEventHandlerRegistry();

// Initialize registry
registry.register('ORDER_CREATED', new OrderCreatedProjectionHandler());
registry.register('ORDER_FINALIZED', new PaymentConfirmedProjectionHandler());
registry.register('PAYMENT_CONFIRMED', new PaymentConfirmedProjectionHandler());
registry.register('PAYMENT_SUCCESSFUL', new PaymentConfirmedProjectionHandler());
registry.register('PRINT_JOB_ACCEPTED', new PrintJobCreatedProjectionHandler());
registry.register('PRINT_STARTED', new PrintJobCreatedProjectionHandler());
registry.register('PRINT_JOB_CREATED', new PrintJobCreatedProjectionHandler());
registry.register('PRINT_READY', new PrintReadyProjectionHandler());
registry.register('PRINT_COMPLETED', new PrintReadyProjectionHandler());
registry.register('DELIVERY_AGENT_ASSIGNED', new DeliveryAssignedProjectionHandler());
registry.register('OUT_FOR_DELIVERY', new DeliveryAssignedProjectionHandler());
registry.register('DELIVERY_COMPLETED', new OrderCompletedProjectionHandler());
registry.register('ORDER_COMPLETED', new OrderCompletedProjectionHandler());

// Helper to make a domain event object
function makeEvent(
  eventId: string,
  eventType: string,
  payload: any,
  version = 1,
  occurredAt = new Date()
): DomainEvent {
  return {
    eventId,
    eventType,
    eventVersion: version,
    occurredAt,
    correlationId: 'corr-xyz-123',
    causationId: 'cause-xyz-123',
    payload
  };
}

async function cleanSlate(): Promise<void> {
  await timelineRepo.deleteAll();
  await projRepo.deleteAll();
  await processedEventsRepo.deleteAll();
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

async function testMapper(): Promise<void> {
  console.log('\n📦 LifecycleStateMapper Tests');

  await test('Known event mappings resolve correctly', async () => {
    assertEqual(LifecycleStateMapper.map('ORDER_CREATED'), LifecycleState.PENDING_PAYMENT, 'ORDER_CREATED');
    assertEqual(LifecycleStateMapper.map('ORDER_FINALIZED'), LifecycleState.CONFIRMED, 'ORDER_FINALIZED');
    assertEqual(LifecycleStateMapper.map('PAYMENT_CONFIRMED'), LifecycleState.CONFIRMED, 'PAYMENT_CONFIRMED');
    assertEqual(LifecycleStateMapper.map('PRINT_STARTED'), LifecycleState.IN_PRODUCTION, 'PRINT_STARTED');
    assertEqual(LifecycleStateMapper.map('PRINT_READY'), LifecycleState.READY_FOR_PICKUP, 'PRINT_READY');
    assertEqual(LifecycleStateMapper.map('DELIVERY_AGENT_ASSIGNED'), LifecycleState.OUT_FOR_DELIVERY, 'DELIVERY_AGENT_ASSIGNED');
    assertEqual(LifecycleStateMapper.map('DELIVERY_COMPLETED'), LifecycleState.DELIVERED, 'DELIVERY_COMPLETED');
  });

  await test('Unknown events are rejected with UnsupportedLifecycleEventError', async () => {
    let threw = false;
    try {
      LifecycleStateMapper.map('RANDOM_UNKNOWN_EVENT');
    } catch (err: any) {
      threw = err instanceof UnsupportedLifecycleEventError;
    }
    assert(threw, 'should throw UnsupportedLifecycleEventError');
  });
}

async function testUpdateServiceBasic(): Promise<void> {
  console.log('\n📦 ProjectionUpdateService Basic Flow');

  await test('New event creates projection, timeline, and processed marker', async () => {
    const event = makeEvent('evt-init-1', 'ORDER_CREATED', {
      orderId: 1001,
      orderHash: 'hash-1001',
      studentId: 5,
      shopId: 12,
      shopName: 'Green Print',
      deliveryType: 'pickup',
      hostelAddress: null,
      totalPrice: 15000
    });

    const handler = registry.get('ORDER_CREATED');
    await handler.handle(event, { projectionUpdateService: updateService });

    // Verify projection exists
    const proj = await projRepo.findByOrderId(1001);
    assert(proj !== null, 'projection created');
    assertEqual(proj!.currentState, LifecycleState.PENDING_PAYMENT, 'PENDING_PAYMENT');
    assertEqual(proj!.totalPrice, 15000, 'totalPrice');

    // Verify timeline event exists
    const timeline = await timelineRepo.findByOrderId(1001);
    assertEqual(timeline.length, 1, 'one timeline event');
    assertEqual(timeline[0].state, LifecycleState.PENDING_PAYMENT, 'state matches');
    assertEqual(timeline[0].title, 'ORDER_CREATED', 'title matches');

    // Verify processed marker is recorded
    const processed = await processedEventsRepo.isProcessed('evt-init-1');
    assert(processed === true, 'event is processed');
  });

  await test('Duplicate events are successfully ignored (idempotency)', async () => {
    // Attempting to run the exact same event id again
    const event = makeEvent('evt-init-1', 'ORDER_CREATED', {
      orderId: 1001,
      orderHash: 'hash-1001',
      studentId: 5,
      shopId: 12,
      shopName: 'Green Print',
      deliveryType: 'pickup',
      hostelAddress: null,
      totalPrice: 15000
    });

    const timelineBefore = await timelineRepo.count();
    const handler = registry.get('ORDER_CREATED');
    await handler.handle(event, { projectionUpdateService: updateService });

    // Verify timeline count did not increase
    const timelineAfter = await timelineRepo.count();
    assertEqual(timelineAfter, timelineBefore, 'timeline count should be identical');
  });

  await test('Transaction rollback on failure leaves state untouched', async () => {
    // Generate a handler mock failure or transition error inside a transaction
    const invalidEvent = makeEvent('evt-invalid-tx', 'PRINT_READY', {
      orderId: 1001,
      printStatus: 'READY'
    });

    // Valid state for order 1001 is PENDING_PAYMENT. Transition to PRINT_READY (READY_FOR_PICKUP) is illegal.
    let threw = false;
    try {
      const handler = registry.get('PRINT_READY');
      await handler.handle(invalidEvent, { projectionUpdateService: updateService });
    } catch (err: any) {
      threw = err instanceof InvalidLifecycleTransitionError;
    }
    assert(threw, 'should throw InvalidLifecycleTransitionError');

    // Rollback verify: processed marker for 'evt-invalid-tx' should NOT exist
    const processed = await processedEventsRepo.isProcessed('evt-invalid-tx');
    assert(processed === false, 'processed marker rolled back');

    // Projection should still be in PENDING_PAYMENT
    const proj = await projRepo.findByOrderId(1001);
    assertEqual(proj!.currentState, LifecycleState.PENDING_PAYMENT, 'state should still be PENDING_PAYMENT');
  });
}

async function testConcurrency(): Promise<void> {
  console.log('\n📦 Concurrency & Race Condition Protection');

  await test('Two workers processing the same event ID concurrently', async () => {
    const event = makeEvent('evt-concurrent-1', 'ORDER_FINALIZED', {
      orderId: 1001,
      invoiceNumber: 'INV-1001',
      paymentStatus: 'CAPTURED'
    });

    const handler = registry.get('ORDER_FINALIZED');
    const errors: Error[] = [];

    const run = async () => {
      try {
        await handler.handle(event, { projectionUpdateService: updateService });
      } catch (err: any) {
        errors.push(err);
      }
    };

    // Run both handlers concurrently
    await Promise.all([run(), run()]);

    // Verify at most one error occurred, and if it did, it is a ProjectionConcurrencyError
    if (errors.length > 0) {
      assert(
        errors.length === 1 && errors[0] instanceof ProjectionConcurrencyError,
        `Expected at most one concurrency error, got: ${errors.map(e => e.message).join(', ')}`
      );
    }

    // Check projection state — must be transitioned to CONFIRMED
    const proj = await projRepo.findByOrderId(1001);
    assert(proj !== null, 'projection should exist');
    assertEqual(proj!.currentState, LifecycleState.CONFIRMED, 'should transition exactly once');

    // Check timeline has only one event added
    const timeline = await timelineRepo.findByOrderId(1001);
    const confTimeline = timeline.filter(t => t.eventId === 'evt-concurrent-1');
    assertEqual(confTimeline.length, 1, 'exactly one timeline event created');
  });
}


async function testTransitionValidation(): Promise<void> {
  console.log('\n📦 State Transition Validation');

  await test('Correct state transition flow works', async () => {
    // 1001 is currently CONFIRMED
    const startPrintEvent = makeEvent('evt-print-start', 'PRINT_STARTED', {
      orderId: 1001,
      printJobId: 444,
      printStatus: 'PRINTING'
    });

    const handler = registry.get('PRINT_STARTED');
    await handler.handle(startPrintEvent, { projectionUpdateService: updateService });

    const proj = await projRepo.findByOrderId(1001);
    assertEqual(proj!.currentState, LifecycleState.IN_PRODUCTION, 'IN_PRODUCTION');
    assertEqual(proj!.printJobId, 444, 'printJobId updated');
  });

  await test('Invalid transitions (e.g. IN_PRODUCTION -> CONFIRMED) are rejected', async () => {
    const backEvent = makeEvent('evt-back', 'ORDER_FINALIZED', {
      orderId: 1001,
      invoiceNumber: 'INV-1001'
    });

    let threw = false;
    try {
      const handler = registry.get('ORDER_FINALIZED');
      await handler.handle(backEvent, { projectionUpdateService: updateService });
    } catch (err: any) {
      threw = err instanceof InvalidLifecycleTransitionError;
    }
    assert(threw, 'should reject backwards transition');
  });
}

async function testFullIntegrationLifecycle(): Promise<void> {
  console.log('\n📦 Full Order Journey Integration Test');

  await test('Full state machine sequence mapping', async () => {
    const orderId = 2000;
    const orderHash = 'hash-2000';

    // 1. ORDER_CREATED
    await registry.get('ORDER_CREATED').handle(
      makeEvent('e1', 'ORDER_CREATED', {
        orderId, orderHash, studentId: 1, shopId: 2, shopName: 'Shop A', deliveryType: 'hostel', totalPrice: 9900
      }),
      { projectionUpdateService: updateService }
    );
    let p = await projRepo.findByOrderId(orderId);
    assertEqual(p!.currentState, LifecycleState.PENDING_PAYMENT, 'State 1: PENDING_PAYMENT');

    // 2. ORDER_FINALIZED
    await registry.get('ORDER_FINALIZED').handle(
      makeEvent('e2', 'ORDER_FINALIZED', { orderId, invoiceNumber: 'INV-2000', paymentStatus: 'CAPTURED' }),
      { projectionUpdateService: updateService }
    );
    p = await projRepo.findByOrderId(orderId);
    assertEqual(p!.currentState, LifecycleState.CONFIRMED, 'State 2: CONFIRMED');
    assertEqual(p!.invoiceNumber, 'INV-2000', 'invoiceNumber saved');

    // 3. PRINT_JOB_ACCEPTED
    await registry.get('PRINT_JOB_ACCEPTED').handle(
      makeEvent('e3', 'PRINT_JOB_ACCEPTED', { orderId, printJobId: 101, printStatus: 'ACCEPTED' }),
      { projectionUpdateService: updateService }
    );
    p = await projRepo.findByOrderId(orderId);
    assertEqual(p!.currentState, LifecycleState.IN_PRODUCTION, 'State 3: IN_PRODUCTION');
    assertEqual(p!.printJobId, 101, 'printJobId saved');

    // 4. PRINT_READY
    await registry.get('PRINT_READY').handle(
      makeEvent('e4', 'PRINT_READY', { orderId, printStatus: 'READY' }),
      { projectionUpdateService: updateService }
    );
    p = await projRepo.findByOrderId(orderId);
    assertEqual(p!.currentState, LifecycleState.READY_FOR_PICKUP, 'State 4: READY_FOR_PICKUP');

    // 5. DELIVERY_AGENT_ASSIGNED
    await registry.get('DELIVERY_AGENT_ASSIGNED').handle(
      makeEvent('e5', 'DELIVERY_AGENT_ASSIGNED', {
        orderId, agentId: 50, agentName: 'Ravi', agentPhone: '9876543210'
      }),
      { projectionUpdateService: updateService }
    );
    p = await projRepo.findByOrderId(orderId);
    assertEqual(p!.currentState, LifecycleState.OUT_FOR_DELIVERY, 'State 5: OUT_FOR_DELIVERY');
    assertEqual(p!.agentName, 'Ravi', 'agentName saved');

    // 6. DELIVERY_COMPLETED
    await registry.get('DELIVERY_COMPLETED').handle(
      makeEvent('e6', 'DELIVERY_COMPLETED', { orderId, fulfillmentStatus: 'DELIVERED' }),
      { projectionUpdateService: updateService }
    );
    p = await projRepo.findByOrderId(orderId);
    assertEqual(p!.currentState, LifecycleState.DELIVERED, 'State 6: DELIVERED');

    // Verify history logs
    const timeline = await timelineRepo.findByOrderId(orderId);
    assertEqual(timeline.length, 6, 'Six timeline log entries');
    assertEqual(timeline[0].state, LifecycleState.PENDING_PAYMENT, 'Log 1 state');
    assertEqual(timeline[1].state, LifecycleState.CONFIRMED, 'Log 2 state');
    assertEqual(timeline[2].state, LifecycleState.IN_PRODUCTION, 'Log 3 state');
    assertEqual(timeline[3].state, LifecycleState.READY_FOR_PICKUP, 'Log 4 state');
    assertEqual(timeline[4].state, LifecycleState.OUT_FOR_DELIVERY, 'Log 5 state');
    assertEqual(timeline[5].state, LifecycleState.DELIVERED, 'Log 6 state');
  });
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Phase 7C — Application Layer Test Suite               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await cleanSlate();

    await testMapper();
    await testUpdateServiceBasic();
    await testConcurrency();
    await testTransitionValidation();
    await testFullIntegrationLifecycle();

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
