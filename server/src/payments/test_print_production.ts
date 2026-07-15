import assert from 'assert';
import db from '../config/database';
import { SqlPrintJobRepository } from './infrastructure/persistence/SqlPrintJobRepository';
import { SqlPrintJobHistoryRepository } from './infrastructure/persistence/SqlPrintJobHistoryRepository';
import { PrintJobAuthorizationService } from './application/services/PrintJobAuthorizationService';
import { PrintProductionService } from './application/services/PrintProductionService';
import { SqlOutboxRepository } from './infrastructure/persistence/SqlOutboxRepository';
import { PrintJob } from './domain/entities/PrintJob';
import { PrintJobStatus } from './domain/enums/PrintJobStatus';
import { CancellationReason } from './domain/enums/CancellationReason';
import { OutboxEventStatus } from './domain/enums/OutboxEventStatus';
import { CorrelationId } from './domain/value-objects/CorrelationId';

const STUDENT_ID = 200;
const MANAGER_ID = 300;
const SHOP_ID = 400;

const UNAUTH_MANAGER_ID = 500;
const UNAUTH_SHOP_ID = 600;

async function setupDb() {
  // Clear print production tables
  await db.execute('PRAGMA foreign_keys = OFF');
  try { await db.execute('DELETE FROM fulfillment_history'); } catch (e) {}
  try { await db.execute('DELETE FROM fulfillments'); } catch (e) {}
  await db.execute("DELETE FROM outbox_events");
  await db.execute('DELETE FROM print_job_history');
  await db.execute('DELETE FROM print_jobs');
  await db.execute('DELETE FROM invoices');
  await db.execute('DELETE FROM payments');
  await db.execute('DELETE FROM notifications WHERE user_id IN (?, ?, ?)', [STUDENT_ID, MANAGER_ID, UNAUTH_MANAGER_ID]);
  await db.execute('DELETE FROM push_subscriptions WHERE user_id IN (?, ?, ?)', [STUDENT_ID, MANAGER_ID, UNAUTH_MANAGER_ID]);
  await db.execute('DELETE FROM deliveries');
  await db.execute('DELETE FROM orders WHERE shop_id IN (?, ?)', [SHOP_ID, UNAUTH_SHOP_ID]);
  await db.execute('DELETE FROM orders WHERE student_id = ?', [STUDENT_ID]);
  await db.execute('DELETE FROM orders WHERE id IN (1001, 1002, 1003, 1004, 1005, 1006)');
  await db.execute('DELETE FROM shops WHERE id IN (?, ?)', [SHOP_ID, UNAUTH_SHOP_ID]);
  await db.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [STUDENT_ID, MANAGER_ID, UNAUTH_MANAGER_ID]);
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

  // Insert Shops
  await db.execute(
    `INSERT INTO shops (id, user_id, shop_name, description, location, is_open, is_approved) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [SHOP_ID, MANAGER_ID, 'Campus Print Shop', 'Desc', 'Loc', 1, 1]
  );
  await db.execute(
    `INSERT INTO shops (id, user_id, shop_name, description, location, is_open, is_approved) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [UNAUTH_SHOP_ID, UNAUTH_MANAGER_ID, 'Unauth Print Shop', 'Desc', 'Loc', 1, 1]
  );

  // Insert Orders
  for (const orderId of [1001, 1002, 1003, 1004, 1005, 1006]) {
    await db.execute(
      `INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [orderId, `hash-order-${orderId}`, STUDENT_ID, SHOP_ID, 'pending', 150.00]
    );
  }
}

async function runTests() {
  console.log('🧪 Starting Print Production Subsystem (Phase 6A) Integration Tests...\n');
  await setupDb();

  const printJobRepository = new SqlPrintJobRepository();
  const printJobHistoryRepository = new SqlPrintJobHistoryRepository();
  const authorizationService = new PrintJobAuthorizationService(printJobRepository);
  const outboxRepository = new SqlOutboxRepository();

  const service = new PrintProductionService(
    printJobRepository,
    printJobHistoryRepository,
    authorizationService,
    outboxRepository
  );

  let passed = 0;
  let failed = 0;

  // Helper to create a print job in a specific state
  async function seedPrintJob(id: number, orderId: number, status: PrintJobStatus): Promise<PrintJob> {
    const job = new PrintJob(
      id,
      orderId,
      SHOP_ID,
      STUDENT_ID,
      status,
      0, // priority
      1, // version
      new Date(), // lastStatusChangedAt
      status !== PrintJobStatus.QUEUED ? new Date() : null, // acceptedAt
      status === PrintJobStatus.PRINTING || status === PrintJobStatus.READY ? new Date() : null, // printingStartedAt
      status === PrintJobStatus.READY ? new Date() : null, // readyAt
      null, // cancelledAt
      status === PrintJobStatus.READY ? new Date() : null, // completedAt
      null,
      null,
      null, // estimatedCompletionAt
      new Date(),
      new Date()
    );
    return await printJobRepository.create(job);
  }

  // Seed print jobs dynamically
  const job1 = await seedPrintJob(1, 1001, PrintJobStatus.QUEUED);
  const job2 = await seedPrintJob(2, 1002, PrintJobStatus.ACCEPTED);
  const job3 = await seedPrintJob(3, 1003, PrintJobStatus.PRINTING);
  const job4 = await seedPrintJob(4, 1004, PrintJobStatus.QUEUED);
  const job5 = await seedPrintJob(5, 1005, PrintJobStatus.ACCEPTED);
  const job6 = await seedPrintJob(6, 1006, PrintJobStatus.QUEUED);

  // --- Test 1: Successful Accept Transition ---
  console.log('🔹 [Test 1] Successful Accept Transition (QUEUED ➔ ACCEPTED)');
  try {
    const cid = CorrelationId.create();
    const result = await service.acceptJob(job1.id, MANAGER_ID, cid);

    // Verify DTO fields
    assert.strictEqual(result.id, job1.id, 'Job ID matches');
    assert.strictEqual(result.status, PrintJobStatus.ACCEPTED, 'Status transitioned to ACCEPTED');
    assert.ok(result.acceptedAt, 'acceptedAt timestamp is set');
    assert.strictEqual(result.version, 2, 'Version incremented to 2');

    // Verify DB update
    const updatedJob = await printJobRepository.findById(job1.id);
    assert.strictEqual(updatedJob?.status, PrintJobStatus.ACCEPTED, 'DB status updated');
    assert.ok(updatedJob?.acceptedAt, 'DB acceptedAt timestamp updated');

    // Verify History Audit Log
    const historyList = await printJobHistoryRepository.findByPrintJobId(job1.id);
    assert.strictEqual(historyList.length, 1, 'One history log inserted');
    assert.strictEqual(historyList[0].previousStatus, PrintJobStatus.QUEUED, 'Logged previous status');
    assert.strictEqual(historyList[0].newStatus, PrintJobStatus.ACCEPTED, 'Logged new status');
    assert.strictEqual(historyList[0].actorType, 'shop', 'Logged actor type shop');
    assert.strictEqual(historyList[0].transitionName, 'ACCEPT', 'Logged transition name ACCEPT');
    assert.strictEqual(historyList[0].changedByUserId, MANAGER_ID, 'Logged acting user ID');
    assert.strictEqual(historyList[0].correlationId, cid.value, 'Logged correct correlation ID');

    // Verify Outbox Event Staged
    const events = await outboxRepository.claimBatch(10, 'worker-1');
    assert.strictEqual(events.length, 1, 'Staged exactly one outbox event');
    assert.strictEqual(events[0].eventType, 'PRINT_JOB_ACCEPTED', 'Event type is PRINT_JOB_ACCEPTED');
    assert.strictEqual(events[0].correlationId, cid.value, 'Outbox event records correlation ID');
    
    const payload = JSON.parse(events[0].payload);
    assert.strictEqual(payload.printJobId, job1.id, 'Payload contains printJobId');
    assert.strictEqual(payload.eventVersion, 1, 'Payload standardization records version');
    assert.ok(payload.occurredAt, 'Payload standardization records occurredAt');
    assert.strictEqual(payload.causationId, cid.value, 'Payload standardization records command causationId');

    console.log('  ✅ [PASS] Successfully accepted print job, logged history audits, and staged standard outbox events.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 1 failed:', e.message);
    failed++;
  }

  // --- Test 2: Successful Printing Transition ---
  console.log('🔹 [Test 2] Successful Printing Transition (ACCEPTED ➔ PRINTING)');
  try {
    const result = await service.startPrinting(job2.id, MANAGER_ID);

    assert.strictEqual(result.status, PrintJobStatus.PRINTING, 'Status transitioned to PRINTING');
    assert.ok(result.printingStartedAt, 'printingStartedAt timestamp is set');

    const updatedJob = await printJobRepository.findById(job2.id);
    assert.strictEqual(updatedJob?.status, PrintJobStatus.PRINTING, 'DB status updated');
    assert.ok(updatedJob?.printingStartedAt, 'DB printingStartedAt set');

    console.log('  ✅ [PASS] Successfully transitioned print job to PRINTING state.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 2 failed:', e.message);
    failed++;
  }

  // --- Test 3: Successful Ready Transition ---
  console.log('🔹 [Test 3] Successful Ready Transition (PRINTING ➔ READY)');
  try {
    const result = await service.markJobReady(job3.id, MANAGER_ID);

    assert.strictEqual(result.status, PrintJobStatus.READY, 'Status transitioned to READY');
    assert.ok(result.readyAt, 'readyAt timestamp is set');
    assert.ok(result.completedAt, 'completedAt timestamp is set');

    const updatedJob = await printJobRepository.findById(job3.id);
    assert.strictEqual(updatedJob?.status, PrintJobStatus.READY, 'DB status updated');
    assert.ok(updatedJob?.readyAt, 'DB readyAt set');
    assert.ok(updatedJob?.completedAt, 'DB completedAt set');

    console.log('  ✅ [PASS] Successfully transitioned print job to READY state.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 3 failed:', e.message);
    failed++;
  }

  // --- Test 4: Idempotency Verification ---
  console.log('🔹 [Test 4] Idempotency Verification (Repeated Transition calls)');
  try {
    // Call accept again on job1 (which is already ACCEPTED).
    const result = await service.acceptJob(job1.id, MANAGER_ID);
    assert.strictEqual(result.status, PrintJobStatus.ACCEPTED, 'Remains ACCEPTED without error');

    console.log('  ✅ [PASS] Redundant actions execute as safe idempotent no-ops.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 4 failed:', e.message);
    failed++;
  }

  // --- Test 5: Shop Owner Authorization ---
  console.log('🔹 [Test 5] Shop Owner Authorization (Rejects unauthorized shop user)');
  try {
    await assert.rejects(
      async () => {
        await service.acceptJob(job1.id, UNAUTH_MANAGER_ID);
      },
      /Forbidden: You do not own the shop managing this print job/
    );

    console.log('  ✅ [PASS] Correctly rejects transitions triggered by non-owner shop users.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 5 failed:', e.message);
    failed++;
  }

  // --- Test 6: Student Cancel Allowed ---
  console.log('🔹 [Test 6] Student Cancel Allowed (Student cancels QUEUED job)');
  try {
    const result = await service.cancelJob(
      { printJobId: job4.id, reasonCode: CancellationReason.STUDENT_REQUESTED, reasonDescription: 'Changed mind' },
      STUDENT_ID
    );

    assert.strictEqual(result.status, PrintJobStatus.CANCELLED, 'Student successfully cancelled job');
    assert.strictEqual(result.cancellationReasonCode, CancellationReason.STUDENT_REQUESTED, 'Recorded reason code');
    assert.strictEqual(result.cancellationDescription, 'Changed mind', 'Recorded description');

    const history = await printJobHistoryRepository.findByPrintJobId(job4.id);
    assert.strictEqual(history[0].actorType, 'student', 'Audited actorType as student');

    console.log('  ✅ [PASS] Student cancels QUEUED print job successfully.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 6 failed:', e.message);
    failed++;
  }

  // --- Test 7: Student Cancel Blocked ---
  console.log('🔹 [Test 7] Student Cancel Blocked (Student cannot cancel ACCEPTED/PRINTING job)');
  try {
    await assert.rejects(
      async () => {
        await service.cancelJob(
          { printJobId: job5.id, reasonCode: CancellationReason.STUDENT_REQUESTED },
          STUDENT_ID
        );
      },
      /Cancellation forbidden: Students can only cancel jobs in QUEUED status/
    );

    const job = await printJobRepository.findById(job5.id);
    assert.strictEqual(job?.status, PrintJobStatus.ACCEPTED, 'Print job remains ACCEPTED');
    console.log('  ✅ [PASS] Blocks student cancellation if print job has progressed to accepted/printing.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 7 failed:', e.message);
    failed++;
  }

  // --- Test 8: Illegal State Transitions ---
  console.log('🔹 [Test 8] Illegal State Transitions (QUEUED ➔ READY)');
  try {
    await assert.rejects(
      async () => {
        await service.markJobReady(job6.id, MANAGER_ID);
      },
      /expected status to be PRINTING/
    );

    console.log('  ✅ [PASS] Throws transitions errors for invalid sequence updates.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 8 failed:', e.message);
    failed++;
  }

  // --- Test 9: Concurrency Lock Serialization ---
  console.log('🔹 [Test 9] Concurrency Lock Serialization (Optimistic Lock Version Check)');
  try {
    const jobEntity = await printJobRepository.findById(job6.id);
    if (!jobEntity) throw new Error('Job 6 not found');

    // Simulate thread 1 updating job status
    jobEntity.status = PrintJobStatus.ACCEPTED;
    await printJobRepository.update(jobEntity); // increments version to 2
    assert.strictEqual(jobEntity.version, 2, 'Version is now 2');

    // Simulate thread 2 trying to commit an update with stale version 1
    const staleJob = new PrintJob(
      jobEntity.id,
      jobEntity.orderId,
      jobEntity.shopId,
      jobEntity.studentId,
      PrintJobStatus.PRINTING,
      jobEntity.priority,
      1, // Stale version
      new Date(),
      new Date(),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      jobEntity.createdAt,
      new Date()
    );

    await assert.rejects(
      async () => {
        await printJobRepository.update(staleJob);
      },
      /Concurrency update failure/
    );

    console.log('  ✅ [PASS] Version checking locks serialize updates and prevent lost updates.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 9 failed:', e.message);
    failed++;
  }

  // --- Test 10: Outbox Polling Delivery ---
  console.log('🔹 [Test 10] Outbox Polling Delivery');
  try {
    const outboxEvents = await outboxRepository.claimBatch(10, 'worker-1');
    assert.ok(outboxEvents.length >= 1, 'Claimed outbox events');
    
    // We update them to PROCESSED representing outbox worker completing delivery
    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepository.update(evt);
    }

    const nextBatch = await outboxRepository.claimBatch(10, 'worker-1');
    assert.strictEqual(nextBatch.length, 0, 'No pending events remaining in outbox');

    console.log('  ✅ [PASS] Outbox claiming and updates proceed successfully.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 10 failed:', e.message);
    failed++;
  }

  console.log('\n🏁 Phase 6A Verification Results: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 6A print production system assertions passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled runner exception:', err);
  process.exit(1);
});
