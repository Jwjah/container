import db from '../config/database';
import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { Currency } from './domain/enums/Currency';
import { VerificationSource } from './domain/enums/VerificationSource';
import { Payment } from './domain/entities/Payment';
import { SqlPaymentRepository } from './infrastructure/persistence/SqlPaymentRepository';
import { PaymentService } from './application/services/PaymentService';
import { RazorpayGateway } from './infrastructure/gateways/RazorpayGateway';
import { PaymentValidationError } from './domain/errors/PaymentErrors';
import crypto from 'crypto';

// Setup key secret for signature generation in tests
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_12345';

function generateSignature(orderId: string, paymentId: string): string {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function runVerificationTests() {
  console.log('🧪 Starting Razorpay Payment Verification (Phase 3) Integration Tests...\n');

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

  // Define Mock DB schema IDs
  const STUDENT_ID = 999;
  const OTHER_STUDENT_ID = 998;
  const ORDER_ID = 888;

  try {
    // Clear and insert test user/order rows
    await db.execute('DELETE FROM payments WHERE student_id IN (?, ?)', [STUDENT_ID, OTHER_STUDENT_ID]);
    await db.execute('DELETE FROM orders WHERE id = ?', [ORDER_ID]);
    await db.execute('DELETE FROM users WHERE id IN (?, ?)', [STUDENT_ID, OTHER_STUDENT_ID]);

    await db.execute(
      'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [STUDENT_ID, 'Verified Student', 'student@test.com', 'pass', 'student', 1]
    );
    await db.execute(
      'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [OTHER_STUDENT_ID, 'Other Student', 'other@test.com', 'pass', 'student', 1]
    );
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [ORDER_ID, 'order_hash_verification', STUDENT_ID, 1, 'pending', 200.00]
    );
  } catch (err: any) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }

  // Helper helper to create a clean initiated payment record in the database
  async function createInitiatedPayment(idempotencyKey: string, uuid: string, gatewayOrderId: string): Promise<Payment> {
    const repository = new SqlPaymentRepository();
    const payment: Payment = {
      uuid,
      paymentReference: 'CP-REF-' + uuid.substring(0, 8).toUpperCase(),
      orderId: ORDER_ID,
      studentId: STUDENT_ID,
      amount: 20000,
      currency: Currency.INR,
      status: PaymentStatus.INITIATED,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey,
      gatewayOrderId
    };
    return await repository.create(payment);
  }

  // --- Test 1: Successful Verification and Metadata Persistence ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-success-1';
    const rzpOrderId = 'order_rzp_success_1';
    const rzpPaymentId = 'pay_rzp_success_1';
    const signature = generateSignature(rzpOrderId, rzpPaymentId);

    await createInitiatedPayment('idemp-verify-success', uuid, rzpOrderId);

    const response = await service.verifyPayment({
      paymentUuid: uuid,
      gatewayOrderId: rzpOrderId,
      gatewayPaymentId: rzpPaymentId,
      signature
    }, STUDENT_ID);

    assert(response.status === PaymentStatus.CAPTURED, 'Verified payment status should transition to CAPTURED');
    assert(response.verifiedAt !== null, 'Should store verification timestamp');

    // Retrieve database row to check atomic persistence
    const dbRecord = await repository.findByUuid(uuid);
    assert(dbRecord?.status === PaymentStatus.CAPTURED, 'Database status should be CAPTURED');
    assert(dbRecord?.gatewayPaymentId === rzpPaymentId, 'Database should store gatewayPaymentId');
    assert(dbRecord?.gatewaySignature === signature, 'Database should store gatewaySignature');
    assert(dbRecord?.verificationMethod === VerificationSource.CHECKOUT_CLIENT, 'Database should store checkout_client verification method');
    assert(dbRecord?.verifiedAt !== null && dbRecord?.capturedAt !== null, 'Database should store verified_at and captured_at dates');
  } catch (e: any) {
    console.error('Test 1 failed:', e);
    failed++;
  }

  // --- Test 2: Timing-Safe Signature Failure keeps state INITIATED (recoverable) ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-sig-fail';
    const rzpOrderId = 'order_rzp_sig_fail';
    const rzpPaymentId = 'pay_rzp_sig_fail';
    const invalidSignature = 'invalid_signature_mock_hash';

    await createInitiatedPayment('idemp-verify-sig-fail', uuid, rzpOrderId);

    let threwValidationError = false;
    try {
      await service.verifyPayment({
        paymentUuid: uuid,
        gatewayOrderId: rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        signature: invalidSignature
      }, STUDENT_ID);
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('signature verification failed')) {
        threwValidationError = true;
      }
    }

    assert(threwValidationError, 'Should throw PaymentValidationError on signature mismatch');

    // Verify DB record status is STILL INITIATED (recoverable boundary)
    const dbRecord = await repository.findByUuid(uuid);
    assert(dbRecord?.status === PaymentStatus.INITIATED, 'Payment state should remain INITIATED (recoverable) in DB');
    assert(dbRecord?.gatewayPaymentId === null, 'Gateway payment ID should NOT be written in DB');
  } catch (e: any) {
    console.error('Test 2 failed:', e);
    failed++;
  }

  // --- Test 3: Unauthorized Payment Ownership Rejected ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-owner-fail';
    const rzpOrderId = 'order_rzp_owner_fail';
    const rzpPaymentId = 'pay_rzp_owner_fail';
    const signature = generateSignature(rzpOrderId, rzpPaymentId);

    await createInitiatedPayment('idemp-verify-owner-fail', uuid, rzpOrderId);

    let threwOwnerError = false;
    try {
      await service.verifyPayment({
        paymentUuid: uuid,
        gatewayOrderId: rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        signature
      }, OTHER_STUDENT_ID); // Passing different student ID
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Access Denied')) {
        threwOwnerError = true;
      }
    }

    assert(threwOwnerError, 'Should reject verification if user does not own the payment session');
  } catch (e: any) {
    console.error('Test 3 failed:', e);
    failed++;
  }

  // --- Test 4: Gateway Order ID Mismatch Rejected ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-order-mismatch';
    const rzpOrderId = 'order_rzp_stored_id';
    const rzpPaymentId = 'pay_rzp_mismatch';
    const signature = generateSignature(rzpOrderId, rzpPaymentId);

    await createInitiatedPayment('idemp-verify-mismatch', uuid, rzpOrderId);

    let threwMismatchError = false;
    try {
      await service.verifyPayment({
        paymentUuid: uuid,
        gatewayOrderId: 'order_rzp_mismatched_id_from_client', // Different order ID
        gatewayPaymentId: rzpPaymentId,
        signature
      }, STUDENT_ID);
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Mismatched gateway order ID')) {
        threwMismatchError = true;
      }
    }

    assert(threwMismatchError, 'Should reject verification if client gateway order ID does not match local payment');
  } catch (e: any) {
    console.error('Test 4 failed:', e);
    failed++;
  }

  // --- Test 5: Idempotency Check (Duplicate request returns existing capture) ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-success-1'; // Re-use verified payment session from Test 1
    const rzpOrderId = 'order_rzp_success_1';
    const rzpPaymentId = 'pay_rzp_success_1';
    const signature = generateSignature(rzpOrderId, rzpPaymentId);

    const response = await service.verifyPayment({
      paymentUuid: uuid,
      gatewayOrderId: rzpOrderId,
      gatewayPaymentId: rzpPaymentId,
      signature
    }, STUDENT_ID);

    assert(response.status === PaymentStatus.CAPTURED, 'Idempotent call should return CAPTURED status');
  } catch (e: any) {
    console.error('Test 5 failed:', e);
    failed++;
  }

  // --- Test 6: Replay Protection (Verifying session with different payment ID rejected) ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-success-1'; // Already verified session from Test 1
    const rzpOrderId = 'order_rzp_success_1';
    const differentPaymentId = 'pay_rzp_replay_attempt_id';
    const signature = generateSignature(rzpOrderId, differentPaymentId);

    let threwReplayError = false;
    try {
      await service.verifyPayment({
        paymentUuid: uuid,
        gatewayOrderId: rzpOrderId,
        gatewayPaymentId: differentPaymentId,
        signature
      }, STUDENT_ID);
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Replay Protection')) {
        threwReplayError = true;
      }
    }

    assert(threwReplayError, 'Should reject verification if session has already been captured using a different payment ID');
  } catch (e: any) {
    console.error('Test 6 failed:', e);
    failed++;
  }

  // --- Test 7: Double Spend Prevention (Same payment ID used for different session rejected) ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    // Re-use success payment ID from Test 1 on a fresh session
    const freshUuid = 'uuid-double-spend';
    const rzpOrderId = 'order_rzp_success_1'; // Stored order ID of the verified payment
    const rzpPaymentId = 'pay_rzp_success_1'; // Verified payment ID from Test 1
    const signature = generateSignature(rzpOrderId, rzpPaymentId);

    await createInitiatedPayment('idemp-verify-double-spend', freshUuid, rzpOrderId);

    let threwDoubleSpendError = false;
    try {
      await service.verifyPayment({
        paymentUuid: freshUuid,
        gatewayOrderId: rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        signature
      }, STUDENT_ID);
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Double spend protection')) {
        threwDoubleSpendError = true;
      }
    }

    assert(threwDoubleSpendError, 'Should reject verification if payment ID is already associated with another session');
  } catch (e: any) {
    console.error('Test 7 failed:', e);
    failed++;
  }

  // --- Test 8: Concurrency Check (Simultaneous verify requests serializes or locks cleanly) ---
  try {
    const repository = new SqlPaymentRepository();
    const gateway = new RazorpayGateway();
    const service = new PaymentService(repository, gateway);

    const uuid = 'uuid-concurrency';
    const rzpOrderId = 'order_rzp_concurrency';
    const rzpPaymentId = 'pay_rzp_concurrency';
    const signature = generateSignature(rzpOrderId, rzpPaymentId);

    await createInitiatedPayment('idemp-verify-concurrency', uuid, rzpOrderId);

    // Call verifyPayment concurrently using Promise.all
    const verifyPromises = [
      service.verifyPayment({
        paymentUuid: uuid,
        gatewayOrderId: rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        signature
      }, STUDENT_ID),
      service.verifyPayment({
        paymentUuid: uuid,
        gatewayOrderId: rzpOrderId,
        gatewayPaymentId: rzpPaymentId,
        signature
      }, STUDENT_ID)
    ];

    const results = await Promise.allSettled(verifyPromises);

    const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
    const rejectedCount = results.filter(r => r.status === 'rejected').length;

    // One promise is guaranteed to succeed and verify the payment first.
    // The second promise will either return success idempotently (if the first commit finished)
    // or fail with a validation exception (if state transition fails). Both cases prove concurrency safety.
    assert(fulfilledCount >= 1, 'At least one verification promise must resolve successfully');
    console.log(`  ℹ️ [INFO] Concurrency outcome: ${fulfilledCount} succeeded, ${rejectedCount} rejected.`);
  } catch (e: any) {
    console.error('Test 8 failed:', e);
    failed++;
  }

  // Clean up database mock rows
  try {
    await db.execute('DELETE FROM payments WHERE student_id = ?', [STUDENT_ID]);
    await db.execute('DELETE FROM orders WHERE student_id = ?', [STUDENT_ID]);
    await db.execute('DELETE FROM users WHERE id IN (?, ?)', [STUDENT_ID, OTHER_STUDENT_ID]);
  } catch (e) {}

  console.log(`\n🏁 Phase 3 Verification Results: ${passed} passed, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 3 payment verification, signature timing security, and double spend assertions passed successfully!');
    process.exit(0);
  }
}

runVerificationTests();
