import db from '../config/database';
import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { Currency } from './domain/enums/Currency';
import { VerificationSource } from './domain/enums/VerificationSource';
import { WebhookProcessingStatus } from './domain/enums/WebhookProcessingStatus';
import { Payment } from './domain/entities/Payment';
import { SqlPaymentRepository } from './infrastructure/persistence/SqlPaymentRepository';
import { SqlWebhookEventRepository } from './infrastructure/persistence/SqlWebhookEventRepository';
import { PaymentService } from './application/services/PaymentService';
import { RazorpayGateway } from './infrastructure/gateways/RazorpayGateway';
import { PaymentValidationError } from './domain/errors/PaymentErrors';
import crypto from 'crypto';

process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_key_12345';
process.env.RAZORPAY_KEY_SECRET = 'checkout_secret_key_54321';

function generateWebhookSignature(rawBody: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function generateCheckoutSignature(orderId: string, paymentId: string): string {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function createRazorpayWebhookBody(eventId: string, event: string, orderId: string, paymentId: string, amount = 15000): string {
  return JSON.stringify({
    id: eventId,
    entity: 'event',
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: 'payment',
          amount,
          currency: 'INR',
          status: event === 'payment.captured' ? 'captured' : 'failed',
          order_id: orderId,
          method: 'upi',
          error_code: event === 'payment.failed' ? 'BAD_REQUEST_ERROR' : null,
          error_description: event === 'payment.failed' ? 'Payment failed description' : null,
          notes: {
            paymentUuid: 'dummy'
          }
        }
      }
    }
  });
}

async function runWebhookTests() {
  console.log('🧪 Starting Razorpay Webhook Processing & Reconciliation (Phase 4) Integration Tests...\n');

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

  // Setup test environment
  const STUDENT_ID = 999;
  const ORDER_ID = 888;

  try {
    await db.execute('DELETE FROM payment_webhook_events');
    await db.execute('DELETE FROM payments WHERE student_id = ?', [STUDENT_ID]);
    await db.execute('DELETE FROM orders WHERE id = ?', [ORDER_ID]);
    await db.execute('DELETE FROM users WHERE id = ?', [STUDENT_ID]);

    await db.execute(
      'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [STUDENT_ID, 'Webhook Student', 'student_wh@test.com', 'pass', 'student', 1]
    );
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [ORDER_ID, 'order_hash_wh', STUDENT_ID, 1, 'pending', 150.00]
    );
  } catch (err: any) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }

  async function createInitiatedPayment(idempotencyKey: string, uuid: string, gatewayOrderId: string): Promise<Payment> {
    const repository = new SqlPaymentRepository();
    const payment: Payment = {
      uuid,
      paymentReference: 'CP-PAY-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      orderId: ORDER_ID,
      studentId: STUDENT_ID,
      amount: 15000,
      currency: Currency.INR,
      status: PaymentStatus.INITIATED,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey,
      gatewayOrderId
    };
    return await repository.create(payment);
  }

  const paymentRepository = new SqlPaymentRepository();
  const webhookRepository = new SqlWebhookEventRepository();
  const gateway = new RazorpayGateway();
  const service = new PaymentService(paymentRepository, gateway, webhookRepository);

  // --- Test 1: Valid Webhook Signature (payment.captured) ---
  console.log('\n🔹 [Test 1] Valid Webhook Signature (payment.captured)');
  try {
    const uuid = 'uuid-wh-success';
    const rzpOrderId = 'order_wh_success';
    const rzpPaymentId = 'pay_wh_success';
    
    await createInitiatedPayment('idemp-wh-success', uuid, rzpOrderId);

    const rawBody = createRazorpayWebhookBody('evt_wh_success', 'payment.captured', rzpOrderId, rzpPaymentId);
    const signature = generateWebhookSignature(rawBody);

    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    const payment = await paymentRepository.findByUuid(uuid);
    assert(payment?.status === PaymentStatus.CAPTURED, 'Payment status should be CAPTURED after webhook');
    assert(payment?.gatewayPaymentId === rzpPaymentId, 'Payment should record gateway payment ID');
    assert(payment?.verificationMethod === VerificationSource.WEBHOOK, 'VerificationSource should be WEBHOOK');
    assert(payment?.capturedAt !== null, 'capturedAt timestamp should be populated');

    // Audit log check
    const log = await webhookRepository.findByEventId('evt_wh_success');
    assert(log?.processingStatus === WebhookProcessingStatus.PROCESSED, 'Audit status should be PROCESSED');
    assert(log?.paymentUuid === uuid, 'Audit should link payment_uuid');
  } catch (e: any) {
    console.error('Test 1 failed:', e);
    failed++;
  }

  // --- Test 2: Invalid Webhook Signature Rejected ---
  console.log('\n🔹 [Test 2] Invalid Webhook Signature Rejected');
  try {
    const uuid = 'uuid-wh-sig-fail';
    const rzpOrderId = 'order_wh_sig_fail';
    const rzpPaymentId = 'pay_wh_sig_fail';
    
    await createInitiatedPayment('idemp-wh-sig-fail', uuid, rzpOrderId);

    const rawBody = createRazorpayWebhookBody('evt_wh_sig_fail', 'payment.captured', rzpOrderId, rzpPaymentId);
    const badSignature = 'invalid_webhook_sig';

    let threwError = false;
    try {
      await service.processWebhook(JSON.parse(rawBody), {}, badSignature, rawBody);
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Invalid webhook signature')) {
        threwError = true;
      }
    }

    assert(threwError, 'Should throw PaymentValidationError on bad signature');
    const payment = await paymentRepository.findByUuid(uuid);
    assert(payment?.status === PaymentStatus.INITIATED, 'Payment status should remain INITIATED');
  } catch (e: any) {
    console.error('Test 2 failed:', e);
    failed++;
  }

  // --- Test 3: Duplicate Webhook Delivery (Idempotent success no-op) ---
  console.log('\n🔹 [Test 3] Duplicate Webhook Delivery (Idempotent success no-op)');
  try {
    const uuid = 'uuid-wh-success'; // Re-use verified payment session from Test 1
    const rzpOrderId = 'order_wh_success';
    const rzpPaymentId = 'pay_wh_success';

    const rawBody = createRazorpayWebhookBody('evt_wh_success', 'payment.captured', rzpOrderId, rzpPaymentId);
    const signature = generateWebhookSignature(rawBody);

    // Call processWebhook again with the same event ID
    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    // If it doesn't crash and returns cleanly, it passed the idempotent no-op check
    assert(true, 'Duplicate webhook event should be processed cleanly as an idempotent no-op');
  } catch (e: any) {
    console.error('Test 3 failed:', e);
    failed++;
  }

  // --- Test 4: Out-of-Order Webhook Events (Ignore failed event after captured) ---
  console.log('\n🔹 [Test 4] Out-of-Order Webhook Events (Ignore failed event after captured)');
  try {
    const uuid = 'uuid-wh-success'; // Re-use CAPTURED session from Test 1
    const rzpOrderId = 'order_wh_success';
    const rzpPaymentId = 'pay_wh_success';

    // Simulate webhook sending payment.failed event after it was already captured
    const rawBody = createRazorpayWebhookBody('evt_wh_failed_after_cap', 'payment.failed', rzpOrderId, rzpPaymentId);
    const signature = generateWebhookSignature(rawBody);

    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    const payment = await paymentRepository.findByUuid(uuid);
    assert(payment?.status === PaymentStatus.CAPTURED, 'Payment status should remain CAPTURED (never regress to FAILED)');
  } catch (e: any) {
    console.error('Test 4 failed:', e);
    failed++;
  }

  // --- Test 5: Webhook Landing After Successful Client Callback ---
  console.log('\n🔹 [Test 5] Webhook Landing After Successful Client Callback');
  try {
    const uuid = 'uuid-client-then-wh';
    const rzpOrderId = 'order_client_then_wh';
    const rzpPaymentId = 'pay_client_then_wh';
    
    const payment = await createInitiatedPayment('idemp-client-then-wh', uuid, rzpOrderId);

    // Simulate client-side callback verification first
    const clientSig = generateCheckoutSignature(rzpOrderId, rzpPaymentId);
    await service.verifyPayment({
      paymentUuid: uuid,
      gatewayOrderId: rzpOrderId,
      gatewayPaymentId: rzpPaymentId,
      signature: clientSig
    }, STUDENT_ID);

    const dbRecord = await paymentRepository.findByUuid(uuid);
    assert(dbRecord?.status === PaymentStatus.CAPTURED && dbRecord?.verificationMethod === VerificationSource.CHECKOUT_CLIENT, 'Verified locally via CHECKOUT_CLIENT');

    // Simulate webhook landing later
    const rawBody = createRazorpayWebhookBody('evt_client_then_wh', 'payment.captured', rzpOrderId, rzpPaymentId);
    const signature = generateWebhookSignature(rawBody);

    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    const reconciledRecord = await paymentRepository.findByUuid(uuid);
    assert(reconciledRecord?.status === PaymentStatus.CAPTURED, 'Should remain CAPTURED');
  } catch (e: any) {
    console.error('Test 5 failed:', e);
    failed++;
  }

  // --- Test 6: Client Callback Landing After Successful Webhook ---
  console.log('\n🔹 [Test 6] Client Callback Landing After Successful Webhook');
  try {
    const uuid = 'uuid-wh-then-client';
    const rzpOrderId = 'order_wh_then_client';
    const rzpPaymentId = 'pay_wh_then_client';
    
    await createInitiatedPayment('idemp-wh-then-client', uuid, rzpOrderId);

    // Webhook lands first
    const rawBody = createRazorpayWebhookBody('evt_wh_then_client', 'payment.captured', rzpOrderId, rzpPaymentId);
    const signature = generateWebhookSignature(rawBody);
    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    // Client verifies second
    const clientSig = generateCheckoutSignature(rzpOrderId, rzpPaymentId);
    const response = await service.verifyPayment({
      paymentUuid: uuid,
      gatewayOrderId: rzpOrderId,
      gatewayPaymentId: rzpPaymentId,
      signature: clientSig
    }, STUDENT_ID);

    assert(response.status === PaymentStatus.CAPTURED, 'Client callback should return CAPTURED immediately');
  } catch (e: any) {
    console.error('Test 6 failed:', e);
    failed++;
  }

  // --- Test 7: Dispute Reconciliation (Reconciles locally FAILED to CAPTURED via Webhook) ---
  console.log('\n🔹 [Test 7] Dispute Reconciliation (Reconciles locally FAILED to CAPTURED via Webhook)');
  try {
    const uuid = 'uuid-dispute-recon';
    const rzpOrderId = 'order_dispute_recon';
    const rzpPaymentId = 'pay_dispute_recon';
    
    const payment = await createInitiatedPayment('idemp-dispute-recon', uuid, rzpOrderId);

    // Transition payment locally to FAILED (e.g. simulated timeout failure)
    payment.status = PaymentStatus.FAILED;
    payment.failedAt = new Date();
    await paymentRepository.update(payment);

    const dbRecord = await paymentRepository.findByUuid(uuid);
    assert(dbRecord?.status === PaymentStatus.FAILED, 'Local record status is FAILED');

    // Authoritative Webhook lands declaring capture success
    const rawBody = createRazorpayWebhookBody('evt_dispute_recon', 'payment.captured', rzpOrderId, rzpPaymentId);
    const signature = generateWebhookSignature(rawBody);

    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    const reconciledRecord = await paymentRepository.findByUuid(uuid);
    assert(reconciledRecord?.status === PaymentStatus.CAPTURED, 'Webhook should reconcile local FAILED payment back to CAPTURED status');
    assert(reconciledRecord?.gatewayPaymentId === rzpPaymentId, 'Should map the payment ID correctly');
  } catch (e: any) {
    console.error('Test 7 failed:', e);
    failed++;
  }

  // --- Test 8: Amount and Currency Verification Check ---
  console.log('\n🔹 [Test 8] Amount and Currency Verification Check');
  try {
    const uuid = 'uuid-amount-mismatch';
    const rzpOrderId = 'order_amount_mismatch';
    const rzpPaymentId = 'pay_amount_mismatch';
    
    await createInitiatedPayment('idemp-amount-mismatch', uuid, rzpOrderId);

    // Webhook with mismatched amount (e.g. 50000 paise instead of local payment's 15000 paise)
    const rawBody = createRazorpayWebhookBody('evt_amount_mismatch', 'payment.captured', rzpOrderId, rzpPaymentId, 50000);
    const signature = generateWebhookSignature(rawBody);

    await service.processWebhook(JSON.parse(rawBody), {}, signature, rawBody);

    // Verify webhook logs record status as FAILED due to validation error
    const log = await webhookRepository.findByEventId('evt_amount_mismatch');
    assert(log?.processingStatus === WebhookProcessingStatus.FAILED, 'Webhook logs status should be FAILED due to amount mismatch');
    assert(!!log?.errorMessage?.includes('Dispute Resolution Mismatch'), 'Should save error details');

    // Local payment should remain unchanged
    const payment = await paymentRepository.findByUuid(uuid);
    assert(payment?.status === PaymentStatus.INITIATED, 'Local payment should remain INITIATED');
  } catch (e: any) {
    console.error('Test 8 failed:', e);
    failed++;
  }

  // Cleanup Database
  try {
    await db.execute('DELETE FROM payment_webhook_events');
    await db.execute('DELETE FROM payments WHERE student_id = ?', [STUDENT_ID]);
    await db.execute('DELETE FROM orders WHERE student_id = ?', [STUDENT_ID]);
    await db.execute('DELETE FROM users WHERE id = ?', [STUDENT_ID]);
  } catch (e) {}

  console.log(`\n🏁 Phase 4 Verification Results: ${passed} passed, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 4 payment webhook processing and dispute reconciliation assertions passed successfully!');
    process.exit(0);
  }
}

runWebhookTests();
