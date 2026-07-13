/**
 * Phase 7B — Repository Integration Tests
 *
 * Tests the three Phase 7 SQL repository implementations against the real
 * SQLite database (same pattern used by test_fulfillment.ts, test_print_production.ts).
 *
 * Run with:
 *   DB_MODE=sqlite npx ts-node src/tracking/tests/repository.test.ts
 *
 * RFC-007 §5.2 / §5.3 — Repository Tests
 */

// Bootstrap env before any import touches database.js
process.env['DB_MODE'] = 'sqlite';

import { SqlOrderLifecycleProjectionRepository } from '../infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../infrastructure/repositories/SqlProcessedEventsRepository';
import { OrderLifecycleProjection } from '../domain/entities/OrderLifecycleProjection';
import { TimelineEvent } from '../domain/entities/TimelineEvent';
import { LifecycleState } from '../domain/enums/LifecycleState';
import { ActorType } from '../domain/enums/ActorType';
import { ProjectionConcurrencyError } from '../domain/errors/TrackingErrors';
import db from '../../config/database';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

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
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Repositories under test
const projRepo      = new SqlOrderLifecycleProjectionRepository();
const timelineRepo  = new SqlTimelineEventRepository();
const processedRepo = new SqlProcessedEventsRepository();

// ─────────────────────────────────────────────────────────────────────────────
// Schema bootstrap — ensure Phase 7 tables exist
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSchema(): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS order_lifecycle_projections (
    order_id INTEGER PRIMARY KEY,
    order_hash TEXT NOT NULL UNIQUE,
    student_id INTEGER NOT NULL,
    shop_id INTEGER NOT NULL,
    shop_name TEXT NOT NULL,
    delivery_type TEXT NOT NULL,
    hostel_address TEXT DEFAULT NULL,
    total_price REAL NOT NULL,
    current_state TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    invoice_number TEXT DEFAULT NULL,
    print_job_id INTEGER DEFAULT NULL,
    print_status TEXT DEFAULT NULL,
    fulfillment_id INTEGER DEFAULT NULL,
    fulfillment_status TEXT DEFAULT NULL,
    assigned_agent_id INTEGER DEFAULT NULL,
    agent_name TEXT DEFAULT NULL,
    agent_phone TEXT DEFAULT NULL,
    last_processed_version INTEGER NOT NULL DEFAULT 0,
    last_processed_occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS order_lifecycle_timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    state TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id INTEGER DEFAULT NULL,
    metadata TEXT DEFAULT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES order_lifecycle_projections(order_id) ON DELETE CASCADE,
    UNIQUE(order_id, event_id)
  )`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Clean slate before each suite
// ─────────────────────────────────────────────────────────────────────────────

async function teardown(): Promise<void> {
  await timelineRepo.deleteAll();
  await projRepo.deleteAll();
  await processedRepo.deleteAll();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture factory
// ─────────────────────────────────────────────────────────────────────────────

function makeProjection(orderId = 9001): OrderLifecycleProjection {
  const now = new Date();
  return new OrderLifecycleProjection(
    orderId,
    `hash${orderId}`,
    42,          // studentId
    7,           // shopId
    'Test Shop',
    'hostel',
    'Room 302, Block C',
    49900,       // totalPrice (paise)
    'PENDING_PAYMENT' as any,
    LifecycleState.PENDING_PAYMENT,
    null, null, null, null, null, null, null,
    LifecycleState.PENDING_PAYMENT,
    0,           // lastProcessedVersion
    now,         // lastProcessedOccurredAt
    1,           // version
    now,
    now,
  );
}

function makeTimeline(
  orderId = 9001,
  eventId = 'evt-001',
  state: LifecycleState = LifecycleState.CONFIRMED,
): TimelineEvent {
  return new TimelineEvent(
    null,
    orderId,
    eventId,
    'ORDER_FINALIZED',
    state,
    'Payment Confirmed',
    'Your payment has been captured.',
    new Date('2026-07-12T10:00:00.000Z'),
    ActorType.SYSTEM,
    null,
    { invoiceNumber: 'INV-2026-001' },
    'corr-111',
    'cause-000',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProcessedEventsRepository suite
// ─────────────────────────────────────────────────────────────────────────────

async function testProcessedEvents(): Promise<void> {
  console.log('\n📦 ProcessedEventsRepository');

  await test('markProcessed() → returns true on first insert', async () => {
    const result = await processedRepo.markProcessed('evt-p-001');
    assert(result === true, 'should return true');
  });

  await test('markProcessed() → returns false on duplicate', async () => {
    await processedRepo.markProcessed('evt-p-002');
    const result = await processedRepo.markProcessed('evt-p-002');
    assert(result === false, 'should return false for duplicate');
  });

  await test('isProcessed() → false for unknown event', async () => {
    const result = await processedRepo.isProcessed('unknown-xyz');
    assert(result === false, 'should be false');
  });

  await test('isProcessed() → true after markProcessed()', async () => {
    await processedRepo.markProcessed('evt-p-003');
    const result = await processedRepo.isProcessed('evt-p-003');
    assert(result === true, 'should be true');
  });

  await test('count() → correct after inserts', async () => {
    const before = await processedRepo.count();
    await processedRepo.markProcessed('evt-p-count-1');
    await processedRepo.markProcessed('evt-p-count-2');
    const after = await processedRepo.count();
    assertEqual(after - before, 2, 'count delta');
  });

  await test('deleteAll() → clears table', async () => {
    await processedRepo.markProcessed('evt-del-1');
    await processedRepo.deleteAll();
    const result = await processedRepo.count();
    assertEqual(result, 0, 'count after deleteAll');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderLifecycleProjectionRepository suite
// ─────────────────────────────────────────────────────────────────────────────

async function testProjectionRepo(): Promise<void> {
  console.log('\n📦 OrderLifecycleProjectionRepository');

  await test('create() → persists projection', async () => {
    const proj = makeProjection(9001);
    await projRepo.create(proj);
    const found = await projRepo.findByOrderId(9001);
    assert(found !== null, 'should find created projection');
    assertEqual(found!.orderHash, 'hash9001', 'orderHash');
    assertEqual(found!.studentId, 42, 'studentId');
    assertEqual(found!.currentState, LifecycleState.PENDING_PAYMENT, 'currentState');
    assertEqual(found!.version, 1, 'version');
  });

  await test('findByOrderId() → returns null for missing order', async () => {
    const found = await projRepo.findByOrderId(99999);
    assert(found === null, 'should be null');
  });

  await test('findByOrderHash() → returns correct projection', async () => {
    const found = await projRepo.findByOrderHash('hash9001');
    assert(found !== null, 'should find by hash');
    assertEqual(found!.orderId, 9001, 'orderId');
  });

  await test('exists() → true for existing projection', async () => {
    const result = await projRepo.exists(9001);
    assert(result === true, 'should exist');
  });

  await test('exists() → false for missing projection', async () => {
    const result = await projRepo.exists(99999);
    assert(result === false, 'should not exist');
  });

  await test('update() → persists state change with version increment', async () => {
    const found = await projRepo.findByOrderId(9001);
    assert(found !== null, 'should find projection');

    // Simulate what ProjectionUpdateService does
    found!.currentState    = LifecycleState.CONFIRMED;
    found!.paymentStatus   = 'CAPTURED';
    found!.invoiceNumber   = 'INV-2026-001';
    found!.lastProcessedVersion = 1;
    found!.updatedAt       = new Date();
    (found as any).version = found!.version + 1; // bump version

    await projRepo.update(found!);

    const updated = await projRepo.findByOrderId(9001);
    assertEqual(updated!.currentState, LifecycleState.CONFIRMED, 'currentState after update');
    assertEqual(updated!.version, 2, 'version after update');
    assertEqual(updated!.invoiceNumber, 'INV-2026-001', 'invoiceNumber');
  });

  await test('update() → throws ProjectionConcurrencyError on stale version', async () => {
    const found = await projRepo.findByOrderId(9001);
    assert(found !== null, 'should find projection');

    // Simulate stale: set version to something the DB no longer has
    (found as any).version = 999; // DB has version=2 → expects WHERE version=998 → 0 rows affected

    let threw = false;
    try {
      await projRepo.update(found!);
    } catch (err: any) {
      threw = err instanceof ProjectionConcurrencyError;
    }
    assert(threw, 'should throw ProjectionConcurrencyError');
  });

  await test('count() → correct after creates', async () => {
    const c = await projRepo.count();
    assert(c >= 1, 'count >= 1');
  });

  await test('deleteAll() → clears projections table', async () => {
    await projRepo.create(makeProjection(9002));
    await projRepo.deleteAll();
    const c = await projRepo.count();
    assertEqual(c, 0, 'count after deleteAll');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelineEventRepository suite
// ─────────────────────────────────────────────────────────────────────────────

async function testTimelineRepo(): Promise<void> {
  console.log('\n📦 TimelineEventRepository');

  // Re-create projection for foreign key
  await projRepo.create(makeProjection(9003));

  await test('append() → inserts timeline event with auto id', async () => {
    const evt = makeTimeline(9003, 'tl-evt-001', LifecycleState.CONFIRMED);
    const saved = await timelineRepo.append(evt);
    assert(saved.id !== null, 'id should be set after insert');
    assertEqual(saved.orderId, 9003, 'orderId');
    assertEqual(saved.eventId, 'tl-evt-001', 'eventId');
  });

  await test('append() → idempotent on duplicate event_id for same order', async () => {
    // Same eventId should not throw — INSERT OR IGNORE
    const evt = makeTimeline(9003, 'tl-evt-001', LifecycleState.CONFIRMED);
    const saved = await timelineRepo.append(evt);
    assert(saved !== null, 'should return without throwing');
  });

  await test('findByOrderId() → returns events in occurredAt ASC order', async () => {
    // Insert second event with later timestamp
    const evt2 = new TimelineEvent(
      null, 9003, 'tl-evt-002', 'PRINT_STARTED',
      LifecycleState.IN_PRODUCTION,
      'Print Started', 'Your documents are being printed.',
      new Date('2026-07-12T10:20:00.000Z'),
      ActorType.SHOP, 7, null, 'corr-111', 'cause-001',
    );
    await timelineRepo.append(evt2);

    const timeline = await timelineRepo.findByOrderId(9003);
    assert(timeline.length === 2, `expected 2 events, got ${timeline.length}`);
    assert(
      timeline[0].occurredAt <= timeline[1].occurredAt,
      'events should be ordered by occurredAt ASC',
    );
    assertEqual(timeline[0].eventId, 'tl-evt-001', 'first event');
    assertEqual(timeline[1].eventId, 'tl-evt-002', 'second event');
  });

  await test('findByEventId() → returns correct event', async () => {
    const found = await timelineRepo.findByEventId('tl-evt-001');
    assert(found !== null, 'should find event');
    assertEqual(found!.state, LifecycleState.CONFIRMED, 'state');
    assertEqual(found!.actorType, ActorType.SYSTEM, 'actorType');
  });

  await test('findByEventId() → null for unknown event', async () => {
    const found = await timelineRepo.findByEventId('no-such-event');
    assert(found === null, 'should return null');
  });

  await test('metadata → serialized and deserialized correctly', async () => {
    const found = await timelineRepo.findByEventId('tl-evt-001');
    assert(found!.metadata !== null, 'metadata should not be null');
    assertEqual(
      (found!.metadata as any).invoiceNumber,
      'INV-2026-001',
      'metadata.invoiceNumber',
    );
  });

  await test('count() → correct after appends', async () => {
    const c = await timelineRepo.count();
    assert(c >= 2, `count >= 2, got ${c}`);
  });

  await test('deleteByOrderId() → removes only target order events', async () => {
    // Create a second order's events
    await projRepo.create(makeProjection(9004));
    await timelineRepo.append(makeTimeline(9004, 'tl-evt-9004'));

    const beforeAll = await timelineRepo.count();
    await timelineRepo.deleteByOrderId(9004);
    const afterAll = await timelineRepo.count();

    assertEqual(afterAll, beforeAll - 1, 'count after deleteByOrderId');
    const remaining = await timelineRepo.findByOrderId(9004);
    assertEqual(remaining.length, 0, 'order 9004 events deleted');
  });

  await test('append-only — no update method exists', async () => {
    const methods = Object.getOwnPropertyNames(
      SqlTimelineEventRepository.prototype,
    );
    assert(!methods.includes('update'), 'update() must not exist on TimelineEventRepository');
  });

  await test('deleteAll() → clears timeline table', async () => {
    await timelineRepo.deleteAll();
    const c = await timelineRepo.count();
    assertEqual(c, 0, 'count after deleteAll');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration verification
// ─────────────────────────────────────────────────────────────────────────────

async function testMigration(): Promise<void> {
  console.log('\n📦 Migration Verification');

  await test('processed_events table exists', async () => {
    const c = await processedRepo.count();
    assert(c >= 0, 'table must exist');
  });

  await test('order_lifecycle_projections table exists', async () => {
    const c = await projRepo.count();
    assert(c >= 0, 'table must exist');
  });

  await test('order_lifecycle_timeline_events table exists', async () => {
    const c = await timelineRepo.count();
    assert(c >= 0, 'table must exist');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Phase 7B — Repository Integration Tests                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await ensureSchema();
    await teardown();

    await testMigration();
    await testProcessedEvents();

    await teardown(); // fresh slate for projection tests
    await testProjectionRepo();

    await teardown(); // fresh slate for timeline tests
    await testTimelineRepo();

  } catch (err: any) {
    console.error('\n💥 Fatal test setup error:', err.message);
    process.exit(1);
  }

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
}

main();
