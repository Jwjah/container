import db from '../config/database';
import { SqlPaymentRepository } from './infrastructure/persistence/SqlPaymentRepository';
import { SqlOrderRepository } from './infrastructure/persistence/SqlOrderRepository';
import { SqlInvoiceRepository } from './infrastructure/persistence/SqlInvoiceRepository';
import { SqlPrintJobRepository } from './infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from './infrastructure/persistence/SqlOutboxRepository';
import { SqlWebhookEventRepository } from './infrastructure/persistence/SqlWebhookEventRepository';
import { RazorpayGateway } from './infrastructure/gateways/RazorpayGateway';
import { PaymentService } from './application/services/PaymentService';
import { OrderFinalizationService } from './application/services/OrderFinalizationService';
import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { Currency } from './domain/enums/Currency';
import { OrderStatus } from './domain/enums/OrderStatus';
import { PrintJobStatus } from './domain/enums/PrintJobStatus';
import { CorrelationId } from './domain/value-objects/CorrelationId';
import { PaymentValidationError } from './domain/errors/PaymentErrors';
import { VerificationSource } from './domain/enums/VerificationSource';
import crypto from 'crypto';

// Setup Mock Razorpay Client
class MockRazorpaySDK {
  public orders = {
    create: async (params: any) => {
      return {
        id: 'rzp_order_mock_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        status: 'created',
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        entity: 'order'
      };
    }
  };
}

const STUDENT_ID = 200;
const MANAGER_ID = 300;
const SHOP_ID = 400;

async function setupDb() {
  await db.execute('PRAGMA foreign_keys = OFF');
  try { await db.execute('DELETE FROM fulfillment_history'); } catch (e) {}
  try { await db.execute('DELETE FROM fulfillments'); } catch (e) {}
  try { await db.execute('DELETE FROM print_job_history'); } catch (e) {}
  try { await db.execute('DELETE FROM print_jobs'); } catch (e) {}
  try { await db.execute('DELETE FROM invoices'); } catch (e) {}
  try { await db.execute('DELETE FROM payments'); } catch (e) {}
  try { await db.execute('DELETE FROM payment_webhook_events'); } catch (e) {}
  try { await db.execute('DELETE FROM orders'); } catch (e) {}
  try { await db.execute('DELETE FROM shops'); } catch (e) {}
  try { await db.execute('DELETE FROM users'); } catch (e) {}
  try { await db.execute('DELETE FROM outbox_events'); } catch (e) {}
  try { await db.execute('DELETE FROM transactions'); } catch (e) {}
  await db.execute('PRAGMA foreign_keys = ON');

  // Insert base tables
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified, wallet_balance) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [STUDENT_ID, 'Test Student', 'student@cp.com', 'pwd', 'student', 1, 0.0]
  );
  await db.execute(
    'INSERT INTO users (id, name, email, password, role, is_verified, wallet_balance) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [MANAGER_ID, 'Test Shop Manager', 'manager@cp.com', 'pwd', 'shop', 1, 0.0]
  );
  await db.execute(
    `INSERT INTO shops (id, user_id, shop_name, description, location, is_open, is_approved, wallet_balance) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [SHOP_ID, MANAGER_ID, 'Campus Print Shop', 'Desc', 'Loc', 1, 1, 0.0]
  );
}

// Helpers to compute test signatures using test secrets
function computeSignature(orderId: string, paymentId: string): string {
  const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
  const text = orderId + '|' + paymentId;
  return crypto.createHmac('sha256', secret).update(text).digest('hex');
}

function computeWebhookSignature(rawPayload: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dummy_webhook_secret';
  return crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
}

async function runE2ETests() {
  console.log('🧪 Starting CampusPrint End-to-End Payments Subsystem Tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  async function assertRejects(promise: Promise<any>, errorPattern: RegExp, testName: string) {
    try {
      await promise;
      console.error(`  ❌ [FAIL] ${testName} (Expected exception but resolved successfully)`);
      failed++;
    } catch (e: any) {
      if (errorPattern.test(e.message || '')) {
        console.log(`  ✅ [PASS] ${testName} (Correctly rejected: ${e.message})`);
        passed++;
      } else {
        console.error(`  ❌ [FAIL] ${testName} (Expected error matching ${errorPattern}, but got: ${e.message})`);
        failed++;
      }
    }
  }

  // Repository & Service Setup
  const paymentRepository = new SqlPaymentRepository();
  const orderRepository = new SqlOrderRepository();
  const invoiceRepository = new SqlInvoiceRepository();
  const printJobRepository = new SqlPrintJobRepository();
  const outboxRepository = new SqlOutboxRepository();
  const webhookEventRepository = new SqlWebhookEventRepository();

  const mockSDK = new MockRazorpaySDK();
  const paymentGateway = new RazorpayGateway(mockSDK);
  
  const paymentService = new PaymentService(paymentRepository, paymentGateway, webhookEventRepository);
  const finalizationService = new OrderFinalizationService(
    paymentRepository,
    orderRepository,
    invoiceRepository,
    printJobRepository,
    outboxRepository
  );

  // Helper to construct orders
  async function createOrder(id: number, price = 150.00) {
    await db.execute(
      `INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, `order_hash_${id}`, STUDENT_ID, SHOP_ID, 'pending', price]
    );
  }

  // Helper to get outbox count
  async function getOutboxCount(): Promise<number> {
    const [rows]: any = await db.execute('SELECT COUNT(*) as count FROM outbox_events');
    return rows[0].count;
  }

  // --- Scenario 1: Successful Payment verification & finalization pipeline ---
  console.log('\n🔹 [Scenario 1] Successful Payment');
  try {
    await setupDb();
    const orderId = 2001;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2001'
    });

    const paymentId = 'pay_2001_success';
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

    const verifyRes = await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    assert(verifyRes.status === PaymentStatus.CAPTURED, 'Payment status transitioned to CAPTURED');

    // Finalize order
    const finalizeRes = await finalizationService.finalizeOrder(initRes.uuid);
    assert(finalizeRes.status === OrderStatus.PAID, 'Order finalized status is confirm (PAID)');

    // DB state validation
    const updatedOrder = await orderRepository.findById(orderId);
    assert(updatedOrder?.status === OrderStatus.PAID, 'Order is confirmed in DB');

    const invoice = await invoiceRepository.findByOrderId(orderId);
    assert(invoice !== null && invoice.total === 150.00, 'Invoice successfully generated');

    const printJob = await printJobRepository.findByOrderId(orderId);
    assert(printJob !== null && printJob.status === PrintJobStatus.QUEUED, 'Print job queued');

    const outboxCount = await getOutboxCount();
    assert(outboxCount === 1, 'Exactly one outbox event generated');
  } catch (e: any) {
    console.error('Scenario 1 failed:', e);
    failed++;
  }

  // --- Scenario 2: Failed Payment ---
  console.log('\n🔹 [Scenario 2] Failed Payment');
  try {
    await setupDb();
    const orderId = 2002;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2002'
    });

    // Simulate gateway failed webhook payload
    const rawPayload = JSON.stringify({
      id: 'evt_failed_2002',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_2002',
            order_id: initRes.gatewayOrderId!,
            amount: 15000,
            currency: 'INR',
            error_code: 'BAD_REQUEST',
            error_description: 'Transaction declined'
          }
        }
      }
    });
    const webhookSig = computeWebhookSignature(rawPayload);

    await paymentService.processWebhook(
      JSON.parse(rawPayload),
      {},
      webhookSig,
      rawPayload
    );

    const payment = await paymentRepository.findByUuid(initRes.uuid);
    assert(payment?.status === PaymentStatus.FAILED, 'Payment session transitioned to FAILED');
    assert(payment?.errorCode === 'BAD_REQUEST', 'Error code stored in payment');

    const order = await orderRepository.findById(orderId);
    assert(order?.status === OrderStatus.PENDING_PAYMENT, 'Order status remains PENDING');

    const invoice = await invoiceRepository.findByOrderId(orderId);
    assert(invoice === null, 'No invoice created on failure');
  } catch (e: any) {
    console.error('Scenario 2 failed:', e);
    failed++;
  }

  // --- Scenario 3: User Closes Razorpay Checkout (Cancelled Payment) ---
  console.log('\n🔹 [Scenario 3] Cancelled Payment (Checkout closed)');
  try {
    await setupDb();
    const orderId = 2003;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2003'
    });

    // User closes checkout -> no verification request is sent.
    // The payment remains in INITIATED status in DB.
    const payment = await paymentRepository.findByUuid(initRes.uuid);
    assert(payment?.status === PaymentStatus.INITIATED, 'Payment remains in INITIATED status');

    const order = await orderRepository.findById(orderId);
    assert(order?.status === OrderStatus.PENDING_PAYMENT, 'Order remains pending_payment');

    const invoice = await invoiceRepository.findByOrderId(orderId);
    assert(invoice === null, 'No invoice exists');
  } catch (e: any) {
    console.error('Scenario 3 failed:', e);
    failed++;
  }

  // --- Scenario 4: Invalid Signature Verification ---
  console.log('\n🔹 [Scenario 4] Invalid signature verification');
  try {
    await setupDb();
    const orderId = 2004;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2004'
    });

    const badVerify = paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: 'pay_2004',
      gatewayOrderId: initRes.gatewayOrderId!,
      signature: 'bad_signature_key'
    }, STUDENT_ID);

    await assertRejects(badVerify, /signature verification failed/, 'Rejects verification with bad signature');

    const payment = await paymentRepository.findByUuid(initRes.uuid);
    assert(payment?.status === PaymentStatus.INITIATED, 'Payment status remains INITIATED');
  } catch (e: any) {
    console.error('Scenario 4 failed:', e);
    failed++;
  }

  // --- Scenario 5: Duplicate verifyPayment API calls (idempotency) ---
  console.log('\n🔹 [Scenario 5] Duplicate verifyPayment calls (idempotency)');
  try {
    await setupDb();
    const orderId = 2005;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2005'
    });

    const paymentId = 'pay_2005';
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

    const firstVerify = await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    assert(firstVerify.status === PaymentStatus.CAPTURED, 'First verification returns CAPTURED');
    await finalizationService.finalizeOrder(initRes.uuid);

    // Call verify again
    const secondVerify = await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    assert(secondVerify.status === PaymentStatus.CAPTURED, 'Second verification succeeds idempotently');

    // Call finalize order again
    await finalizationService.finalizeOrder(initRes.uuid);

    const [invoicesCount]: any = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert(invoicesCount[0].count === 1, 'Exactly one invoice generated (no duplicates)');

    const [jobsCount]: any = await db.execute('SELECT COUNT(*) as count FROM print_jobs WHERE order_id = ?', [orderId]);
    assert(jobsCount[0].count === 1, 'Exactly one print job created (no duplicates)');
  } catch (e: any) {
    console.error('Scenario 5 failed:', e);
    failed++;
  }

  // --- Scenario 6: Duplicate Webhook Delivery ---
  console.log('\n🔹 [Scenario 6] Duplicate webhook delivery');
  try {
    await setupDb();
    const orderId = 2006;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2006'
    });

    const rawPayload = JSON.stringify({
      id: 'evt_captured_2006',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_2006',
            order_id: initRes.gatewayOrderId!,
            amount: 15000,
            currency: 'INR'
          }
        }
      }
    });
    const webhookSig = computeWebhookSignature(rawPayload);

    // First webhook delivery
    await paymentService.processWebhook(
      JSON.parse(rawPayload),
      {},
      webhookSig,
      rawPayload
    );
    await finalizationService.finalizeOrder(initRes.uuid);

    // Second webhook delivery
    await paymentService.processWebhook(
      JSON.parse(rawPayload),
      {},
      webhookSig,
      rawPayload
    );

    const [invoicesCount]: any = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert(invoicesCount[0].count === 1, 'No duplicate invoices generated on duplicate webhook');
  } catch (e: any) {
    console.error('Scenario 6 failed:', e);
    failed++;
  }

  // --- Scenario 7: Webhook Arriving Before Verify API ---
  console.log('\n🔹 [Scenario 7] Webhook arriving before verify API');
  try {
    await setupDb();
    const orderId = 2007;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2007'
    });

    const paymentId = 'pay_2007';
    const rawPayload = JSON.stringify({
      id: 'evt_captured_2007',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: initRes.gatewayOrderId!,
            amount: 15000,
            currency: 'INR'
          }
        }
      }
    });
    const webhookSig = computeWebhookSignature(rawPayload);

    // Webhook executes first
    await paymentService.processWebhook(
      JSON.parse(rawPayload),
      {},
      webhookSig,
      rawPayload
    );
    await finalizationService.finalizeOrder(initRes.uuid);

    // Client verification executes second
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);
    const verifyRes = await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    assert(verifyRes.status === PaymentStatus.CAPTURED, 'Client verify handles webhook-first capture cleanly');
    await finalizationService.finalizeOrder(initRes.uuid);

    const [invoicesCount]: any = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert(invoicesCount[0].count === 1, 'Exactly one invoice generated');
  } catch (e: any) {
    console.error('Scenario 7 failed:', e);
    failed++;
  }

  // --- Scenario 8: Verify API Arriving Before Webhook ---
  console.log('\n🔹 [Scenario 8] Verify API arriving before webhook');
  try {
    await setupDb();
    const orderId = 2008;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2008'
    });

    const paymentId = 'pay_2008';
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

    // Verify API executes first
    const verifyRes = await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);
    assert(verifyRes.status === PaymentStatus.CAPTURED, 'Client verify captures successfully');
    await finalizationService.finalizeOrder(initRes.uuid);

    // Webhook executes second
    const rawPayload = JSON.stringify({
      id: 'evt_captured_2008',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: initRes.gatewayOrderId!,
            amount: 15000,
            currency: 'INR'
          }
        }
      }
    });
    const webhookSig = computeWebhookSignature(rawPayload);

    await paymentService.processWebhook(
      JSON.parse(rawPayload),
      {},
      webhookSig,
      rawPayload
    );

    const [invoicesCount]: any = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert(invoicesCount[0].count === 1, 'Exactly one invoice exists (webhook deduplicated)');
  } catch (e: any) {
    console.error('Scenario 8 failed:', e);
    failed++;
  }

  // --- Scenario 9: Webhook-only success flow ---
  console.log('\n🔹 [Scenario 9] Webhook-only success flow');
  try {
    await setupDb();
    const orderId = 2009;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2009'
    });

    const paymentId = 'pay_2009';
    const rawPayload = JSON.stringify({
      id: 'evt_captured_2009',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: initRes.gatewayOrderId!,
            amount: 15000,
            currency: 'INR'
          }
        }
      }
    });
    const webhookSig = computeWebhookSignature(rawPayload);

    // Webhook completes finalization directly without client verification call
    await paymentService.processWebhook(
      JSON.parse(rawPayload),
      {},
      webhookSig,
      rawPayload
    );
    const result = await finalizationService.finalizeOrder(initRes.uuid);

    assert(result.status === OrderStatus.PAID, 'Order finalized successfully via webhook reconciliation');
    const order = await orderRepository.findById(orderId);
    assert(order?.status === OrderStatus.PAID, 'Order marked confirmed in database');
  } catch (e: any) {
    console.error('Scenario 9 failed:', e);
    failed++;
  }

  // --- Scenario 10: Payment already captured ---
  console.log('\n🔹 [Scenario 10] Payment already captured check');
  try {
    await setupDb();
    const orderId = 2010;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2010'
    });

    const paymentId = 'pay_2010';
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

    await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    // Attempting to verify again with a DIFFERENT payment ID is rejected
    const verifyReplayConflict = paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: 'pay_2010_fake',
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    await assertRejects(verifyReplayConflict, /already been captured with a different payment ID/, 'Blocks capturing already captured session with different ID');
  } catch (e: any) {
    console.error('Scenario 10 failed:', e);
    failed++;
  }

  // --- Scenario 11: Payment Timeout ---
  console.log('\n🔹 [Scenario 11] Payment timeout (stale session cleanup)');
  try {
    await setupDb();
    const orderId = 2011;
    await createOrder(orderId);

    // Create an old payment session created 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const oldUuid = crypto.randomUUID();
    
    // Inject custom created_at/updated_at
    await db.execute(
      `INSERT INTO payments (uuid, payment_reference, order_id, student_id, amount, currency, status, payment_method, gateway, idempotency_key, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        oldUuid,
        'CP-PAY-OLD-11',
        orderId,
        STUDENT_ID,
        15000,
        'INR',
        PaymentStatus.CREATED,
        PaymentMethod.UPI,
        PaymentGatewayProvider.RAZORPAY,
        'idemp-stale-11',
        tenMinutesAgo.toISOString().replace('T', ' ').substring(0, 19),
        tenMinutesAgo.toISOString().replace('T', ' ').substring(0, 19)
      ]
    );

    // Initiate new payment session for same order
    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-fresh-11'
    });

    assert(initRes.status === PaymentStatus.INITIATED, 'New payment initiated successfully');

    // Assert old payment was marked as FAILED with timeout details
    const oldPayment = await paymentRepository.findByUuid(oldUuid);
    assert(oldPayment?.status === PaymentStatus.FAILED, 'Stale payment transitioned to FAILED');
    assert(oldPayment?.errorCode === 'STALE_INITIATION_CLEANUP', 'Stale payment logs error code');
  } catch (e: any) {
    console.error('Scenario 11 failed:', e);
    failed++;
  }

  // --- Scenario 12: Invalid Razorpay Order ID ---
  console.log('\n🔹 [Scenario 12] Invalid Razorpay Order ID');
  try {
    await setupDb();
    const orderId = 2012;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2012'
    });

    const verifyBadOrderId = paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: 'pay_2012',
      gatewayOrderId: 'invalid_order_id_123',
      signature: 'signature'
    }, STUDENT_ID);

    await assertRejects(verifyBadOrderId, /Mismatched gateway order ID/, 'Rejects mismatched gateway order ID');
  } catch (e: any) {
    console.error('Scenario 12 failed:', e);
    failed++;
  }

  // --- Scenario 13: Invalid Payment ID ---
  console.log('\n🔹 [Scenario 13] Invalid Payment ID');
  try {
    await setupDb();
    const orderId = 2013;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2013'
    });

    const verifyBadPaymentId = paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: '',
      gatewayOrderId: initRes.gatewayOrderId!,
      signature: 'signature'
    }, STUDENT_ID);

    await assertRejects(verifyBadPaymentId, /Missing required verification parameters/, 'Rejects verification if payment ID is missing');
  } catch (e: any) {
    console.error('Scenario 13 failed:', e);
    failed++;
  }

  // --- Scenario 14: Replay-safe payment verification ---
  console.log('\n🔹 [Scenario 14] Replay-safe payment verification');
  try {
    await setupDb();
    const orderId = 2014;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2014'
    });

    const paymentId = 'pay_2014';
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

    await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    // Call finalizeOrder
    await finalizationService.finalizeOrder(initRes.uuid);

    // Simulate finalization call repeating (replay)
    await finalizationService.finalizeOrder(initRes.uuid);

    const [invoicesCount]: any = await db.execute('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?', [orderId]);
    assert(invoicesCount[0].count === 1, 'Invoice table remains at 1 (no duplicate generation on replay)');

    const [jobsCount]: any = await db.execute('SELECT COUNT(*) as count FROM print_jobs WHERE order_id = ?', [orderId]);
    assert(jobsCount[0].count === 1, 'Print jobs table remains at 1 (no duplicate jobs on replay)');
  } catch (e: any) {
    console.error('Scenario 14 failed:', e);
    failed++;
  }

  // --- Scenario 15: Outbox event generation after successful payment ---
  console.log('\n🔹 [Scenario 15] Outbox event generation');
  try {
    await setupDb();
    const orderId = 2015;
    await createOrder(orderId);

    const initRes = await paymentService.initiatePayment({
      orderId,
      studentId: STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-2015'
    });

    const paymentId = 'pay_2015';
    const signature = computeSignature(initRes.gatewayOrderId!, paymentId);

    await paymentService.verifyPayment({
      paymentUuid: initRes.uuid,
      gatewayPaymentId: paymentId,
      gatewayOrderId: initRes.gatewayOrderId!,
      signature
    }, STUDENT_ID);

    await finalizationService.finalizeOrder(initRes.uuid);

    const claimed = await outboxRepository.claimBatch(10, 'e2e-worker');
    assert(claimed.length === 1, 'Exactly one outbox event staged');
    assert(claimed[0].eventType === 'ORDER_FINALIZED', 'Outbox event is ORDER_FINALIZED');

    // Parse event payload
    const payload = JSON.parse(claimed[0].payload);
    assert(payload.orderId === orderId, 'Outbox event payload links correct orderId');
    assert(payload.studentId === STUDENT_ID, 'Outbox event payload links correct studentId');
  } catch (e: any) {
    console.error('Scenario 15 failed:', e);
    failed++;
  }

  // --- Financial and wallet assertions ---
  console.log('\n🔹 [Database Verification] Ledger & wallet checks');
  try {
    // Assert user and shop wallet balances remain unchanged during checkout/finalization
    const [[student]]: any = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [STUDENT_ID]);
    assert(student.wallet_balance === 0.0, 'Student wallet balance is unaffected by payment capture');

    const [[shop]]: any = await db.execute('SELECT wallet_balance FROM shops WHERE id = ?', [SHOP_ID]);
    assert(shop.wallet_balance === 0.0, 'Shop wallet balance is unaffected by payment capture');

    const [transactionsCount]: any = await db.execute('SELECT COUNT(*) as count FROM transactions');
    assert(transactionsCount[0].count === 0, 'No premature entries created in transactions ledger');
  } catch (e: any) {
    console.error('Ledger assertions failed:', e);
    failed++;
  }

  console.log('\n🏁 E2E Payment Integration Verification Results:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\n❌ Failed integration scenarios detected!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All 15 E2E payment checkout, verify, and webhook reconciliation integration scenarios passed!`);
  }
}

runE2ETests().catch((err) => {
  console.error('Execution failure:', err);
  process.exit(1);
});
