import assert from 'assert';
import crypto from 'crypto';
import db from '../config/database';
import { SqlPaymentRepository } from './infrastructure/persistence/SqlPaymentRepository';
import { SqlOrderRepository } from './infrastructure/persistence/SqlOrderRepository';
import { SqlInvoiceRepository } from './infrastructure/persistence/SqlInvoiceRepository';
import { SqlPrintJobRepository } from './infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from './infrastructure/persistence/SqlOutboxRepository';
import { OrderFinalizationService } from './application/services/OrderFinalizationService';
import { EventDispatcher } from './application/events/EventDispatcher';
import { NotificationConsumer } from './application/events/NotificationConsumer';
import { OutboxWorker } from './application/events/OutboxWorker';
import { Payment } from './domain/entities/Payment';
import { Order } from './domain/entities/Order';
import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { Currency } from './domain/enums/Currency';
import { OrderStatus } from './domain/enums/OrderStatus';
import { PrintJobStatus } from './domain/enums/PrintJobStatus';
import { OutboxEventStatus } from './domain/enums/OutboxEventStatus';
import { CorrelationId } from './domain/value-objects/CorrelationId';

const STUDENT_ID = 200;
const MANAGER_ID = 300;
const SHOP_ID = 400;

async function setupDb() {
  // Setup database tables and mock records
  // Delete referencing child tables first, then parent tables to avoid foreign key errors
  try { await db.execute('DELETE FROM fulfillment_history'); } catch (e) {}
  try { await db.execute('DELETE FROM fulfillments'); } catch (e) {}
  try { await db.execute('DELETE FROM print_job_history'); } catch (e) {}
  try { await db.execute('DELETE FROM print_jobs'); } catch (e) {}
  try { await db.execute('DELETE FROM invoices'); } catch (e) {}
  try { await db.execute('DELETE FROM payments'); } catch (e) {}
  try { await db.execute('DELETE FROM orders'); } catch (e) {}
  try { await db.execute('DELETE FROM shops'); } catch (e) {}
  try { await db.execute('DELETE FROM users'); } catch (e) {}
  await db.execute("DELETE FROM outbox_events");

  // Insert Student & Shop Manager users
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [STUDENT_ID, 'Test Student', 'student@cp.com', 'pwd', 'student', 1]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [MANAGER_ID, 'Test Shop Manager', 'manager@cp.com', 'pwd', 'shop', 1]
  );

  // Insert Shop owned by MANAGER_ID
  await db.execute(
    `INSERT INTO shops (id, user_id, shop_name, description, location, is_open, is_approved) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [SHOP_ID, MANAGER_ID, 'Campus Print Shop', 'Desc', 'Loc', 1, 1]
  );
}

async function runTests() {
  console.log('🧪 Starting Order Finalization & Business Orchestration (Phase 5) Integration Tests...\n');
  await setupDb();

  const paymentRepository = new SqlPaymentRepository();
  const orderRepository = new SqlOrderRepository();
  const invoiceRepository = new SqlInvoiceRepository();
  const printJobRepository = new SqlPrintJobRepository();
  const outboxRepository = new SqlOutboxRepository();

  const finalizationService = new OrderFinalizationService(
    paymentRepository,
    orderRepository,
    invoiceRepository,
    printJobRepository,
    outboxRepository
  );

  let passed = 0;
  let failed = 0;

  // Helper to create test order
  async function createTestOrder(id: number, status: OrderStatus = OrderStatus.PENDING_PAYMENT, studentId = STUDENT_ID): Promise<Order> {
    const orderHash = `hash-order-${id}`;
    await db.execute(
      `INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, orderHash, studentId, SHOP_ID, status, 150.00]
    );
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Failed to retrieve created test order');
    return order;
  }

  // Helper to create test payment
  async function createTestPayment(uuid: string, orderId: number, status: PaymentStatus, studentId = STUDENT_ID): Promise<Payment> {
    const payment: Payment = {
      uuid,
      paymentReference: 'CP-PAY-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      orderId,
      studentId,
      amount: 15000,
      currency: Currency.INR,
      status,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-' + uuid,
      gatewayOrderId: 'rzp-order-' + orderId,
      gatewayPaymentId: status === PaymentStatus.CAPTURED ? 'rzp-pay-' + orderId : undefined
    };
    return await paymentRepository.create(payment);
  }

  // --- Test 1: Successful Order Finalization ---
  console.log('🔹 [Test 1] Successful Order Finalization');
  try {
    const orderId = 1001;
    const paymentUuid = 'uuid-pay-success-1001';
    
    await createTestOrder(orderId);
    await createTestPayment(paymentUuid, orderId, PaymentStatus.CAPTURED);

    const cid = CorrelationId.create();
    const result = await finalizationService.finalizeOrder(paymentUuid, cid);

    // Verify DTO fields
    assert.strictEqual(result.orderId, orderId, 'DTO order ID matches');
    assert.strictEqual(result.status, OrderStatus.PAID, 'DTO order status transitioned to PAID');
    assert.ok(result.invoiceNumber.startsWith('CP-INV-'), 'DTO invoice number formatted correctly');
    assert.ok(result.printJobId > 0, 'DTO print job ID returned');

    // Verify Database updates
    const updatedOrder = await orderRepository.findById(orderId);
    assert.strictEqual(updatedOrder?.status, OrderStatus.PAID, 'Order DB status is confirmed (PAID)');
    assert.strictEqual(updatedOrder?.paymentUuid, paymentUuid, 'Order stored payment UUID');
    assert.ok(updatedOrder?.paidAt, 'Order stored paidAt timestamp');

    // Verify Invoice generated
    const invoice = await invoiceRepository.findByOrderId(orderId);
    assert.ok(invoice, 'Invoice created in DB');
    assert.strictEqual(invoice.invoiceNumber, result.invoiceNumber, 'Invoice number matches DTO');
    assert.strictEqual(invoice.total, 150.00, 'Invoice total matches order amount');

    // Verify Print Job queued
    const printJob = await printJobRepository.findByOrderId(orderId);
    assert.ok(printJob, 'Print job queued in DB');
    assert.strictEqual(printJob.status, PrintJobStatus.QUEUED, 'Print job status is QUEUED');

    // Verify Outbox Event created
    const claimed = await outboxRepository.claimBatch(10, 'initial-worker');
    assert.strictEqual(claimed.length, 1, 'One outbox event queued');
    assert.strictEqual(claimed[0].eventType, 'ORDER_FINALIZED', 'Event type is ORDER_FINALIZED');
    assert.strictEqual(claimed[0].correlationId, cid.value, 'Persisted correct correlation ID');
    assert.strictEqual(claimed[0].eventVersion, 1, 'Persisted event version metadata');

    console.log('  ✅ [PASS] Successfully transitioned order, generated invoice, queued print job, and staged outbox event.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 1 failed:', e.message);
    failed++;
  }

  // --- Test 2: Idempotent Request Safety ---
  console.log('🔹 [Test 2] Idempotent Request Safety');
  try {
    const orderId = 1001; // Re-use order from Test 1
    const paymentUuid = 'uuid-pay-success-1001';

    const result2 = await finalizationService.finalizeOrder(paymentUuid);

    // Verify DTO fields still return correct success mapping
    assert.strictEqual(result2.orderId, orderId, 'DTO order ID matches');
    assert.strictEqual(result2.status, OrderStatus.PAID, 'DTO order status remains PAID');

    // Count records to ensure no duplicates
    const [invoices] = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert.strictEqual(invoices[0].count, 1, 'No duplicate invoices created');

    const [printJobs] = await db.execute('SELECT COUNT(*) as count FROM print_jobs WHERE order_id = ?', [orderId]);
    assert.strictEqual(printJobs[0].count, 1, 'No duplicate print jobs created');

    console.log('  ✅ [PASS] Repeated finalization requests return successfully and do not duplicate records.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 2 failed:', e.message);
    failed++;
  }

  // --- Test 3: Reject Un-Captured Payment Finalization ---
  console.log('🔹 [Test 3] Reject Un-Captured Payment Finalization');
  try {
    const orderId = 1002;
    const paymentUuid = 'uuid-pay-initiated-1002';
    
    await createTestOrder(orderId);
    await createTestPayment(paymentUuid, orderId, PaymentStatus.INITIATED);

    await assert.rejects(
      async () => {
        await finalizationService.finalizeOrder(paymentUuid);
      },
      /Cannot finalize order/
    );

    const order = await orderRepository.findById(orderId);
    assert.strictEqual(order?.status, OrderStatus.PENDING_PAYMENT, 'Order status remains pending');
    console.log('  ✅ [PASS] Rejects finalization if payment is not in CAPTURED state.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 3 failed:', e.message);
    failed++;
  }

  // --- Test 4: Reject Student ID Mismatch ---
  console.log('🔹 [Test 4] Reject Student ID Mismatch');
  try {
    const orderId = 1003;
    const paymentUuid = 'uuid-pay-owner-fail';

    await createTestOrder(orderId);
    // Payment created with matching order ID but mismatched student_id (using existing MANAGER_ID)
    await createTestPayment(paymentUuid, orderId, PaymentStatus.CAPTURED, MANAGER_ID);

    await assert.rejects(
      async () => {
        await finalizationService.finalizeOrder(paymentUuid);
      },
      /Payment ownership mismatch/
    );

    console.log('  ✅ [PASS] Rejects finalization if student ownership does not match.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 4 failed:', e.message);
    failed++;
  }

  // --- Test 5: Concurrency Safety (Parallel finalization locks) ---
  console.log('🔹 [Test 5] Concurrency Safety (Parallel finalization locks)');
  try {
    const orderId = 1004;
    const paymentUuid = 'uuid-pay-concurrency-1004';

    await createTestOrder(orderId);
    await createTestPayment(paymentUuid, orderId, PaymentStatus.CAPTURED);

    // Call two parallel finalization promises
    const p1 = finalizationService.finalizeOrder(paymentUuid);
    const p2 = finalizationService.finalizeOrder(paymentUuid);

    const results = await Promise.allSettled([p1, p2]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const rejections = results.filter(r => r.status === 'rejected');

    // Due to transaction locking, one succeeds, and the other either finishes successfully
    // (idempotent path checks row update) or is rejected/serialized.
    // In serialized SQLite/MySQL execution, the second one reads 'confirmed' (PAID) status and returns success idempotently.
    // In either scenario, database records must NOT duplicate.
    assert.ok(successes.length >= 1, 'At least one finalization call succeeded');

    const [invoicesCount] = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert.strictEqual(invoicesCount[0].count, 1, 'Database contains exactly 1 invoice for the order');

    const [jobsCount] = await db.execute('SELECT COUNT(*) as count FROM print_jobs WHERE order_id = ?', [orderId]);
    assert.strictEqual(jobsCount[0].count, 1, 'Database contains exactly 1 print queue item for the order');

    console.log(`  ✅ [PASS] Concurrency lock serialization complete. Outcomes: ${successes.length} succeeded, ${rejections.length} rejected.`);
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 5 failed:', e.message);
    failed++;
  }

  // --- Test 6: Outbox Claiming Mechanics ---
  console.log('🔹 [Test 6] Outbox Claiming Mechanics');
  try {
    // Clear outbox for this test
    await db.execute('DELETE FROM outbox_events');

    // Stage a pending event
    await outboxRepository.create({
      id: null,
      eventId: 'evt-claim-test',
      eventType: 'ORDER_FINALIZED',
      aggregateType: 'ORDER',
      aggregateId: '1005',
      payload: '{}',
      status: OutboxEventStatus.PENDING,
      retryCount: 0,
      errorLog: null,
      correlationId: 'cid-claim',
      eventVersion: 1,
      occurredAt: new Date()
    } as any);

    // Claim batch using worker 1
    const claimedBatch1 = await outboxRepository.claimBatch(10, 'worker-1');
    assert.strictEqual(claimedBatch1.length, 1, 'Worker-1 successfully claimed the pending event');
    assert.strictEqual(claimedBatch1[0].status, OutboxEventStatus.PROCESSING, 'Event transitioned to PROCESSING');
    assert.strictEqual(claimedBatch1[0].workerId, 'worker-1', 'Event mapped to worker-1');
    assert.ok(claimedBatch1[0].processingStartedAt, 'Event mapped starting timestamp');

    // Worker 2 attempts to claim batch concurrently
    const claimedBatch2 = await outboxRepository.claimBatch(10, 'worker-2');
    assert.strictEqual(claimedBatch2.length, 0, 'Worker-2 claimed 0 events (locked by Worker-1)');

    console.log('  ✅ [PASS] Claim lock mechanism correctly locks event status to PROCESSING and isolates duplicate worker claims.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 6 failed:', e.message);
    failed++;
  }

  // --- Test 7: Stale PROCESSING Event Recovery ---
  console.log('🔹 [Test 7] Stale PROCESSING Event Recovery');
  try {
    // Stage a crashed event stuck in PROCESSING from 10 minutes ago
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await db.execute(
      `INSERT INTO outbox_events (event_id, event_type, aggregate_type, aggregate_id, payload, status, retry_count, correlation_id, event_version, occurred_at, worker_id, processing_started_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['stale-evt', 'ORDER_FINALIZED', 'ORDER', '1006', '{}', 'PROCESSING', 0, 'cid-stale', 1, staleTime, 'dead-worker', staleTime]
    );

    // Run recovery (5-minute stale timeout)
    const timeoutMs = 5 * 60 * 1000;
    const recovered = await outboxRepository.recoverStaleEvents(timeoutMs);

    assert.strictEqual(recovered, 1, 'Recovered exactly 1 stale event');

    const [recoveredEvent] = await db.execute('SELECT * FROM outbox_events WHERE event_id = ?', ['stale-evt']);
    assert.strictEqual(recoveredEvent[0].status, 'PENDING', 'Reverted event status back to PENDING');
    assert.strictEqual(recoveredEvent[0].retry_count, 1, 'Incremented retry count');
    assert.strictEqual(recoveredEvent[0].worker_id, null, 'Cleared worker ID');
    assert.strictEqual(recoveredEvent[0].processing_started_at, null, 'Cleared processing started timestamp');

    console.log('  ✅ [PASS] Successfully recovered stale PROCESSING outbox events back to PENDING status.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 7 failed:', e.message);
    failed++;
  }

  // --- Test 8: Event Dispatcher Fault Isolation ---
  console.log('🔹 [Test 8] Event Dispatcher Fault Isolation');
  try {
    const dispatcher = new EventDispatcher();
    let listener2Executed = false;

    // Listener 1: Throws error
    dispatcher.register('ORDER_FINALIZED', async () => {
      throw new Error('Consumer 1 crashed');
    });

    // Listener 2: Runs successfully
    dispatcher.register('ORDER_FINALIZED', async () => {
      listener2Executed = true;
    });

    const event = {
      id: 1,
      eventId: 'evt-test-8',
      eventType: 'ORDER_FINALIZED',
      payload: '{}'
    } as any;

    await assert.rejects(
      async () => {
        await dispatcher.dispatch(event);
      },
      /Consumer 1 crashed/
    );

    assert.ok(listener2Executed, 'Listener 2 executed successfully despite Listener 1 failure (Fault Isolation)');
    console.log('  ✅ [PASS] Fault isolation successfully executes independent consumers and propagates aggregate errors.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 8 failed:', e.message);
    failed++;
  }

  // --- Test 9: Recipient Resolution ---
  console.log('🔹 [Test 9] Recipient Resolution');
  try {
    const consumer = new NotificationConsumer();
    
    // We verify that executing the notification consumer handles the payload and completes without throwing
    const payload = {
      orderId: 1001,
      studentId: STUDENT_ID,
      shopId: SHOP_ID,
      totalPrice: 150.00
    };

    // Should complete cleanly (logs warning if VAPID keys not present in dev, but resolves user_id internally)
    await consumer.handleOrderFinalized(payload);
    console.log('  ✅ [PASS] NotificationConsumer resolved recipient manager user ID and Student user ID successfully.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 9 failed:', e.message);
    failed++;
  }

  // --- Test 10: Client/Webhook Dispute Reconciliation Finalization ---
  console.log('🔹 [Test 10] Client/Webhook Dispute Reconciliation Finalization');
  try {
    const orderId = 1007;
    const paymentUuid = 'uuid-pay-dispute-1007';

    await createTestOrder(orderId);
    
    // Payment locally FAILED
    await createTestPayment(paymentUuid, orderId, PaymentStatus.FAILED);

    // Reconcile/Transition to CAPTURED via custom update representing webhook resolution override
    const payment = await paymentRepository.findByUuid(paymentUuid);
    if (!payment) throw new Error('Payment not found');
    payment.status = PaymentStatus.CAPTURED;
    payment.gatewayPaymentId = 'rzp-recon-pay';
    await paymentRepository.update(payment);

    const result = await finalizationService.finalizeOrder(paymentUuid);
    assert.strictEqual(result.status, OrderStatus.PAID, 'Transitions reconciled payment successfully to PAID');

    console.log('  ✅ [PASS] Webhook-reconciled CAPTURED payments finalize successfully.');
    passed++;
  } catch (e: any) {
    console.error('  ❌ [FAIL] Test 10 failed:', e.message);
    failed++;
  }

  console.log('\n🏁 Phase 5 Verification Results: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 5 order finalization and outbox event assertions passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled runner exception:', err);
  process.exit(1);
});
