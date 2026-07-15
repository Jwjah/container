import assert from 'assert';
import db from '../config/database';
import { SqlFulfillmentRepository } from './infrastructure/persistence/SqlFulfillmentRepository';
import { SqlFulfillmentHistoryRepository } from './infrastructure/persistence/SqlFulfillmentHistoryRepository';
import { SqlOrderRepository } from './infrastructure/persistence/SqlOrderRepository';
import { SqlPrintJobRepository } from './infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from './infrastructure/persistence/SqlOutboxRepository';
import { OtpService } from './application/services/OtpService';
import { FulfillmentAuthorizationService } from './application/services/FulfillmentAuthorizationService';
import { FulfillmentService } from './application/services/FulfillmentService';
import { PrintReadyListener } from './application/events/PrintReadyListener';
import { CorrelationId } from './domain/value-objects/CorrelationId';
import { FulfillmentStatus } from './domain/enums/FulfillmentStatus';
import { FulfillmentMode } from './domain/enums/FulfillmentMode';
import { FulfillmentFailureReason } from './domain/enums/FulfillmentFailureReason';
import { FulfillmentTransition } from './domain/enums/FulfillmentTransition';
import { OutboxEventStatus } from './domain/enums/OutboxEventStatus';

const STUDENT_ID = 200;
const MANAGER_ID = 300;
const SHOP_ID = 400;
const UNAUTH_MANAGER_ID = 500;
const AGENT_ID = 700;
const ADMIN_ID = 800;

async function setupDb() {
  // Clear tables
  await db.execute('PRAGMA foreign_keys = OFF');
  await db.execute('DELETE FROM fulfillment_history');
  await db.execute('DELETE FROM fulfillments');
  await db.execute("DELETE FROM outbox_events WHERE aggregate_type = 'FULFILLMENT' OR aggregate_type = 'PRINT_JOB'");
  await db.execute('DELETE FROM print_job_history');
  await db.execute('DELETE FROM print_jobs');
  await db.execute('DELETE FROM orders');
  await db.execute('DELETE FROM shops');
  await db.execute('DELETE FROM users');
  await db.execute('PRAGMA foreign_keys = ON');

  // Insert Users
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [STUDENT_ID, 'Test Student', 'student@cp.com', 'pwd', 'student', 1]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [MANAGER_ID, 'Test Shop Manager', 'manager@cp.com', 'pwd', 'shop', 1]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [UNAUTH_MANAGER_ID, 'Unauth Manager', 'unauth@cp.com', 'pwd', 'shop', 1]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [AGENT_ID, 'Test Agent', 'agent@cp.com', 'pwd', 'agent', 1]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [ADMIN_ID, 'Test Admin', 'admin@cp.com', 'pwd', 'admin', 1]
  );

  // Insert Shops
  await db.execute(
    `INSERT INTO shops (id, user_id, shop_name, description, location, is_open, is_approved) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [SHOP_ID, MANAGER_ID, 'Campus Print Shop', 'Desc', 'Loc', 1, 1]
  );

  // Insert Orders
  // Order 1001 for Delivery
  await db.execute(
    `INSERT INTO orders (id, order_hash, student_id, shop_id, status, delivery_type, total_price) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1001, 'hash-order-1001', STUDENT_ID, SHOP_ID, 'ready', 'hostel', 150.00]
  );
  // Order 1002 for Pickup
  await db.execute(
    `INSERT INTO orders (id, order_hash, student_id, shop_id, status, delivery_type, total_price) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1002, 'hash-order-1002', STUDENT_ID, SHOP_ID, 'ready', 'pickup', 100.00]
  );

  // Insert Print Jobs (linked to orders)
  await db.execute(
    `INSERT INTO print_jobs (id, order_id, shop_id, student_id, status) VALUES (?, ?, ?, ?, ?)`,
    [2001, 1001, SHOP_ID, STUDENT_ID, 'READY']
  );
  await db.execute(
    `INSERT INTO print_jobs (id, order_id, shop_id, student_id, status) VALUES (?, ?, ?, ?, ?)`,
    [2002, 1002, SHOP_ID, STUDENT_ID, 'READY']
  );
}

async function runTests() {
  console.log('🧪 Starting Fulfillment Subsystem (Phase 6B) Integration Tests...\n');
  await setupDb();

  const fulfillmentRepository = new SqlFulfillmentRepository();
  const fulfillmentHistoryRepository = new SqlFulfillmentHistoryRepository();
  const orderRepository = new SqlOrderRepository();
  const printJobRepository = new SqlPrintJobRepository();
  const outboxRepository = new SqlOutboxRepository();
  const otpService = new OtpService();
  const authorizationService = new FulfillmentAuthorizationService();

  const service = new FulfillmentService(
    fulfillmentRepository,
    fulfillmentHistoryRepository,
    orderRepository,
    printJobRepository,
    outboxRepository,
    otpService,
    authorizationService
  );

  const listener = new PrintReadyListener(service);

  let passed = 0;
  let failed = 0;

  // --- Test 1: Initialization ---
  console.log('🔹 [Test 1] Initialization via PRINT_READY Event');
  try {
    const cid = CorrelationId.create();
    await listener.handle({
      orderId: 1001,
      shopId: SHOP_ID,
      studentId: STUDENT_ID,
      printJobId: 2001,
      correlationId: cid.value
    });

    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f, 'Fulfillment created');
    assert.strictEqual(f?.status, FulfillmentStatus.READY, 'Initial status is READY');
    assert.strictEqual(f?.mode, FulfillmentMode.DELIVERY, 'Mode is DELIVERY based on order');
    assert.strictEqual(f?.printJobId, 2001, 'Linked to print job 2001');

    // Verify audit log
    const history = await fulfillmentHistoryRepository.findByFulfillmentId(f!.id);
    assert.strictEqual(history.length, 1, 'One history audit log exists');
    assert.strictEqual(history[0].transitionName, FulfillmentTransition.INITIALIZED);
    assert.strictEqual(history[0].performedByUserId, STUDENT_ID);

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 2: Idempotent Initialization ---
  console.log('🔹 [Test 2] Idempotent Initialization (Duplicate Events)');
  try {
    const f1 = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f1);

    const result = await service.initializeFromPrintReady(1001, SHOP_ID, STUDENT_ID, 2001);
    assert.strictEqual(result.id, f1?.id, 'Returns existing fulfillment ID');

    const [rows] = await db.execute('SELECT COUNT(*) as count FROM fulfillments WHERE order_id = 1001');
    assert.strictEqual(rows[0].count, 1, 'Only one row in DB');

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 3: Agent Assignment & Authorization ---
  console.log('🔹 [Test 3] Agent Assignment (Authorized & Unauthorized)');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // 1. Unauthorized shop manager attempts assignment
    try {
      await service.assignAgent(f!.id, AGENT_ID, UNAUTH_MANAGER_ID);
      assert.fail('Should reject unauthorized shop manager');
    } catch (err: any) {
      assert.ok(err.message.includes('Forbidden'), 'Expected Forbidden error');
    }

    // 2. Authorized shop manager assigns agent
    const res = await service.assignAgent(f!.id, AGENT_ID, MANAGER_ID);
    assert.strictEqual(res.status, FulfillmentStatus.DELIVERY_ASSIGNED, 'Status transitioned to DELIVERY_ASSIGNED');
    assert.strictEqual(res.assignedAgentId, AGENT_ID, 'Agent ID updated');
    assert.ok(res.otpExpiresAt, 'OTP expiry is set');

    // Verify outbox contains the rawOtp
    const outboxEvents = await outboxRepository.claimBatch(10, 'test-worker');
    const assignEvent = outboxEvents.find(e => e.eventType === 'FULFILLMENT_ASSIGNED');
    assert.ok(assignEvent, 'Event FULFILLMENT_ASSIGNED staged in outbox');
    const payload = JSON.parse(assignEvent!.payload);
    assert.ok(payload.rawOtp, 'Raw OTP exists in outbox event payload');
    assert.strictEqual(payload.rawOtp.length, 6, 'Raw OTP is 6 digits');

    // Reset status to processed
    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 4: Start Delivery ---
  console.log('🔹 [Test 4] Start Delivery');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // 1. Unauthorized user tries to start delivery
    try {
      await service.startDelivery(f!.id, STUDENT_ID);
      assert.fail('Should reject non-assigned agent');
    } catch (err: any) {
      assert.ok(err.message.includes('Forbidden'), 'Expected Forbidden error');
    }

    // 2. Assigned agent starts delivery
    const res = await service.startDelivery(f!.id, AGENT_ID);
    assert.strictEqual(res.status, FulfillmentStatus.OUT_FOR_DELIVERY, 'Status transitioned to OUT_FOR_DELIVERY');
    assert.strictEqual(res.deliveryAttempts, 1, 'Delivery attempts incremented to 1');

    // Verify event named FULFILLMENT_STARTED is staged
    const events = await outboxRepository.claimBatch(10, 'test-worker');
    const startEvent = events.find(e => e.eventType === 'FULFILLMENT_STARTED');
    assert.ok(startEvent, 'Event FULFILLMENT_STARTED staged in outbox');

    for (const evt of events) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 5: OTP Verification & Locked Attempts ---
  console.log('🔹 [Test 5] OTP Verification (Success, Failure & Locked Attempts)');
  try {
    let f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // Get rawOtp from previously processed outbox event or history
    // Since we cleared outbox, let's just regenerate the OTP to capture it
    const regenRes = await service.regenerateOtp(f!.id, STUDENT_ID);
    
    // Find the outbox event to get the raw OTP
    const events = await outboxRepository.claimBatch(10, 'test-worker');
    const regenEvent = events.find(e => e.eventType === 'OTP_REGENERATED');
    const rawOtp = JSON.parse(regenEvent!.payload).rawOtp;
    assert.ok(rawOtp, 'Captured regenerated raw OTP');

    for (const evt of events) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    // Reload fulfillment
    f = await fulfillmentRepository.findByOrderId(1001);

    // 1. Verify invalid OTP
    try {
      await service.verifyOtp(f!.id, '000000', AGENT_ID);
      assert.fail('Should reject invalid OTP');
    } catch (err: any) {
      assert.strictEqual(err.message, 'Invalid OTP');
    }

    // Verify attempt counter incremented
    let updatedF = await fulfillmentRepository.findByOrderId(1001);
    assert.strictEqual(updatedF?.otpAttempts, 1, 'OTP attempts is 1');
    assert.strictEqual(updatedF?.otpVerifiedAt, null, 'OTP is not verified');

    // 2. Verify with correct OTP
    const successRes = await service.verifyOtp(f!.id, rawOtp, AGENT_ID);
    assert.ok(successRes.otpVerifiedAt, 'otpVerifiedAt is set');
    assert.strictEqual(successRes.otpAttempts, 0, 'otpAttempts reset to 0');
    assert.strictEqual(successRes.status, FulfillmentStatus.OUT_FOR_DELIVERY, 'Status remains OUT_FOR_DELIVERY');

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 6: OTP Expiry ---
  console.log('🔹 [Test 6] OTP Expiry Validation');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // Artificially expire the OTP
    await db.execute('UPDATE fulfillments SET otp_expires_at = ? WHERE id = ?', [
      new Date(Date.now() - 1000).toISOString(),
      f!.id
    ]);

    try {
      await service.verifyOtp(f!.id, '123456', AGENT_ID);
      assert.fail('Should reject expired OTP');
    } catch (err: any) {
      assert.ok(err.message.includes('expired'), 'Expected expired error');
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 7: OTP Brute-Force Lockout ---
  console.log('🔹 [Test 7] Brute-Force Lockout (3 attempts)');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // Reset expiry to future, but set attempts to 2
    await db.execute(
      'UPDATE fulfillments SET otp_expires_at = ?, otp_attempts = ?, otp_verified_at = NULL WHERE id = ?',
      [new Date(Date.now() + 300000).toISOString(), 2, f!.id]
    );

    // 3rd attempt: invalid OTP
    try {
      await service.verifyOtp(f!.id, '000000', AGENT_ID);
      assert.fail('Should fail on 3rd attempt');
    } catch (err: any) {
      assert.strictEqual(err.message, 'Invalid OTP');
    }

    // 4th attempt: should throw lockout error immediately
    try {
      await service.verifyOtp(f!.id, '000000', AGENT_ID);
      assert.fail('Should block immediately due to lockout');
    } catch (err: any) {
      assert.ok(err.message.includes('lockout'), 'Expected lockout error');
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 8: Student OTP Regeneration ---
  console.log('🔹 [Test 8] OTP Regeneration (Resets lockouts & updates expiry)');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // Student regenerates OTP
    const res = await service.regenerateOtp(f!.id, STUDENT_ID);
    assert.strictEqual(res.otpAttempts, 0, 'Resets OTP attempts');
    assert.strictEqual(res.otpVerifiedAt, null, 'Resets verification timestamp');

    // Verify we can perform OTP verification again (lockout cleared)
    const events = await outboxRepository.claimBatch(10, 'test-worker');
    const regenEvent = events.find(e => e.eventType === 'OTP_REGENERATED');
    const newRawOtp = JSON.parse(regenEvent!.payload).rawOtp;

    for (const evt of events) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    const successRes = await service.verifyOtp(f!.id, newRawOtp, AGENT_ID);
    assert.ok(successRes.otpVerifiedAt, 'OTP successfully verified after regeneration');

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 9: Delivery Completion ---
  console.log('🔹 [Test 9] Delivery Completion (Requires OTP Verification & Proof)');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // Complete delivery
    const proofRef = 'https://s3.amazonaws.com/campusprint/proofs/delivery-1001.jpg';
    const res = await service.completeDelivery(f!.id, proofRef, AGENT_ID);
    assert.strictEqual(res.status, FulfillmentStatus.DELIVERED, 'Status is DELIVERED');
    assert.strictEqual(res.proofOfDeliveryReference, proofRef, 'Proof reference saved');
    assert.ok(res.actualDeliveryAt, 'actualDeliveryAt timestamp set');

    // Verify outbox contains DELIVERY_COMPLETED
    const events = await outboxRepository.claimBatch(10, 'test-worker');
    const completedEvent = events.find(e => e.eventType === 'DELIVERY_COMPLETED');
    assert.ok(completedEvent, 'Staged DELIVERY_COMPLETED event');

    for (const evt of events) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 10: Pickup Flow ---
  console.log('🔹 [Test 10] Pickup Flow (Initialization & Completion)');
  try {
    // 1. Initialize for order 1002 (Pickup mode)
    await listener.handle({
      orderId: 1002,
      shopId: SHOP_ID,
      studentId: STUDENT_ID,
      printJobId: 2002
    });

    const f = await fulfillmentRepository.findByOrderId(1002);
    assert.ok(f);
    assert.strictEqual(f?.mode, FulfillmentMode.PICKUP, 'Mode resolved as PICKUP');
    assert.strictEqual(f?.status, FulfillmentStatus.READY, 'Status is READY');

    // 2. Complete Pickup
    const res = await service.completePickup(f!.id, MANAGER_ID);
    assert.strictEqual(res.status, FulfillmentStatus.PICKUP_COMPLETED, 'Status transitioned to PICKUP_COMPLETED');
    assert.ok(res.actualDeliveryAt, 'actualDeliveryAt is set');

    // Verify outbox
    const events = await outboxRepository.claimBatch(10, 'test-worker');
    const pickupEvent = events.find(e => e.eventType === 'PICKUP_COMPLETED');
    assert.ok(pickupEvent, 'Staged PICKUP_COMPLETED event');

    for (const evt of events) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 11: Fail Delivery ---
  console.log('🔹 [Test 11] Fail Delivery');
  try {
    // Setup a new delivery fulfillment for Order 1001 by resetting state
    await db.execute('DELETE FROM fulfillment_history');
    await db.execute('DELETE FROM fulfillments');

    const initRes = await service.initializeFromPrintReady(1001, SHOP_ID, STUDENT_ID, 2001);
    await service.assignAgent(initRes.id, AGENT_ID, MANAGER_ID);
    await service.startDelivery(initRes.id, AGENT_ID);

    // Fail delivery
    const res = await service.failDelivery(initRes.id, FulfillmentFailureReason.STUDENT_UNAVAILABLE, AGENT_ID);
    assert.strictEqual(res.status, FulfillmentStatus.FAILED, 'Status is FAILED');
    assert.strictEqual(res.failureReason, FulfillmentFailureReason.STUDENT_UNAVAILABLE);

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 12: Optimistic Locking Concurrent Updates ---
  console.log('🔹 [Test 12] Optimistic Locking Concurrency Check');
  try {
    const f = await fulfillmentRepository.findByOrderId(1001);
    assert.ok(f);

    // Load two copies of the same entity aggregate
    const aggregateCopy1 = await fulfillmentRepository.findById(f!.id);
    const aggregateCopy2 = await fulfillmentRepository.findById(f!.id);
    assert.ok(aggregateCopy1);
    assert.ok(aggregateCopy2);

    // Update first copy (version increments)
    aggregateCopy1!.estimatedDeliveryAt = new Date();
    await fulfillmentRepository.update(aggregateCopy1!);

    // Attempt to update second copy (stale version, must throw error)
    try {
      aggregateCopy2!.estimatedDeliveryAt = new Date();
      await fulfillmentRepository.update(aggregateCopy2!);
      assert.fail('Should throw concurrency exception');
    } catch (err: any) {
      assert.ok(err.message.includes('Concurrency update failure'), 'Expected optimistic locking exception');
    }

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  // --- Test 13: Repository findByPrintJobId ---
  console.log('🔹 [Test 13] Repository findByPrintJobId');
  try {
    const f = await fulfillmentRepository.findByPrintJobId(2001);
    assert.ok(f, 'Fulfillment found by print job ID');
    assert.strictEqual(f?.orderId, 1001);

    console.log('  ✅ [PASS]');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL]:', e.message);
    failed++;
  }

  console.log(`\n🏁 Phase 6B Verification Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 6B fulfillment subsystem assertions passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled runner exception:', err);
  process.exit(1);
});
