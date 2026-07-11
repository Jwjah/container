import db from '../config/database';
import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { Currency } from './domain/enums/Currency';
import { Payment } from './domain/entities/Payment';
import { SqlPaymentRepository } from './infrastructure/persistence/SqlPaymentRepository';
import { PaymentService } from './application/services/PaymentService';
import { RazorpayGateway } from './infrastructure/gateways/RazorpayGateway';
import { PaymentValidationError, ProviderApiError } from './domain/errors/PaymentErrors';

// Define Mock Razorpay SDK class
class MockRazorpaySDK {
  public delayMs = 0;
  public transientFailuresCount = 0;
  public permanentFailure = false;
  public createCalls = 0;

  public orders = {
    create: async (params: any) => {
      this.createCalls++;
      console.log(`[MockRazorpay] create called ${this.createCalls} times with:`, JSON.stringify(params));

      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }

      if (this.transientFailuresCount > 0) {
        this.transientFailuresCount--;
        // Simulate transient ETIMEDOUT error
        console.log(`[MockRazorpay] throwing transient error, remaining: ${this.transientFailuresCount}`);
        throw { code: 'ETIMEDOUT', message: 'Transient connection timeout' };
      }

      if (this.permanentFailure) {
        console.log(`[MockRazorpay] throwing permanent failure`);
        throw { statusCode: 400, message: 'Invalid payment key configuration' };
      }

      console.log(`[MockRazorpay] success`);
      return {
        id: 'order_mock_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        status: 'created',
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        entity: 'order'
      };
    }
  };
}

async function runIntegrationTests() {
  console.log('🧪 Starting Razorpay Order Creation (Phase 2) Integration Tests...\n');

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

  // Set up mock DB schema rows
  const TEST_STUDENT_ID = 999;
  const OTHER_STUDENT_ID = 998;
  const TEST_ORDER_PENDING = 888;
  const TEST_ORDER_READY = 887;

  try {
    // Clear any previous mock test data
    await db.execute('DELETE FROM payments WHERE student_id IN (?, ?)', [TEST_STUDENT_ID, OTHER_STUDENT_ID]);
    await db.execute('DELETE FROM orders WHERE id IN (?, ?)', [TEST_ORDER_PENDING, TEST_ORDER_READY]);
    await db.execute('DELETE FROM users WHERE id IN (?, ?)', [TEST_STUDENT_ID, OTHER_STUDENT_ID]);

    // Insert dummy records
    await db.execute(
      'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [TEST_STUDENT_ID, 'Test Student', 'student@test.com', 'pass', 'student', 1]
    );
    await db.execute(
      'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [OTHER_STUDENT_ID, 'Other Student', 'other@test.com', 'pass', 'student', 1]
    );

    // Pending Order (Payable)
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [TEST_ORDER_PENDING, 'order_hash_pending', TEST_STUDENT_ID, 1, 'pending', 150.00]
    );

    // Ready Order (Non-payable)
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [TEST_ORDER_READY, 'order_hash_ready', TEST_STUDENT_ID, 1, 'ready', 150.00]
    );

  } catch (err: any) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }

  let repository = new SqlPaymentRepository();
  let mockSDK = new MockRazorpaySDK();
  // Inject the mock SDK into the real RazorpayGateway adapter
  let gateway = new RazorpayGateway(mockSDK);
  let service = new PaymentService(repository, gateway);

  // --- Test 1: Successful Order Creation ---
  try {
    mockSDK.createCalls = 0;
    mockSDK.delayMs = 0;
    mockSDK.transientFailuresCount = 0;
    mockSDK.permanentFailure = false;

    const response = await service.initiatePayment({
      orderId: TEST_ORDER_PENDING,
      studentId: TEST_STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-key-success-1'
    });

    assert(response.status === PaymentStatus.INITIATED, 'New payment status should be INITIATED');
    assert(response.amount === 15000, 'Payment amount should be computed as 15000 paise (₹150.00)');
    assert(response.gatewayOrderId !== null, 'Payment should store Razorpay Gateway Order ID');
    assert(response.paymentReference.startsWith('CP-PAY-'), 'Payment should generate human-readable reference');
    
    // Check database row
    const dbRecord = await repository.findByUuid(response.uuid);
    assert(dbRecord !== null && dbRecord.status === PaymentStatus.INITIATED, 'Database record should be stored in INITIATED status');
  } catch (e: any) {
    console.error('Test 1 failed:', e);
    failed++;
  }

  // --- Test 2: Duplicate Idempotency Key returns existing session ---
  try {
    mockSDK.createCalls = 0;
    const key = 'idemp-key-success-1'; // Re-use key from Test 1

    const response = await service.initiatePayment({
      orderId: TEST_ORDER_PENDING,
      studentId: TEST_STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: key
    });

    assert(mockSDK.createCalls === 0, 'Gateway should NOT be hit on idempotent duplicate requests');
    assert(response.status === PaymentStatus.INITIATED, 'Should return the existing INITIATED payment');
  } catch (e: any) {
    console.error('Test 2 failed:', e);
    failed++;
  }

  // --- Test 3: Different Idempotency Key with active lock is rejected ---
  try {
    let rejected = false;
    try {
      await service.initiatePayment({
        orderId: TEST_ORDER_PENDING,
        studentId: TEST_STUDENT_ID,
        paymentMethod: PaymentMethod.UPI,
        gateway: PaymentGatewayProvider.RAZORPAY,
        idempotencyKey: 'different-idemp-key'
      });
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('active payment session is already in progress')) {
        rejected = true;
      }
    }
    assert(rejected, 'Should reject payment initiation if another active session is running for the same order');
  } catch (e: any) {
    console.error('Test 3 failed:', e);
    failed++;
  }

  // --- Test 4: Unauthorized ownership rejected ---
  try {
    let rejected = false;
    try {
      await service.initiatePayment({
        orderId: TEST_ORDER_PENDING,
        studentId: OTHER_STUDENT_ID, // Mismatched student ID
        paymentMethod: PaymentMethod.UPI,
        gateway: PaymentGatewayProvider.RAZORPAY,
        idempotencyKey: 'idemp-key-ownership-fail'
      });
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Access Denied')) {
        rejected = true;
      }
    }
    assert(rejected, 'Should deny payment creation if user does not own the order');
  } catch (e: any) {
    console.error('Test 4 failed:', e);
    failed++;
  }

  // --- Test 5: Invalid order status rejected ---
  try {
    let rejected = false;
    try {
      await service.initiatePayment({
        orderId: TEST_ORDER_READY, // Status 'ready', not 'pending'
        studentId: TEST_STUDENT_ID,
        paymentMethod: PaymentMethod.UPI,
        gateway: PaymentGatewayProvider.RAZORPAY,
        idempotencyKey: 'idemp-key-status-fail'
      });
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Order is not in a payable state')) {
        rejected = true;
      }
    }
    assert(rejected, 'Should reject payment creation if order status is not pending');
  } catch (e: any) {
    console.error('Test 5 failed:', e);
    failed++;
  }

  // --- Test 6: Gateway Timeout handles transitions to FAILED ---
  try {
    repository = new SqlPaymentRepository();
    mockSDK = new MockRazorpaySDK();
    gateway = new RazorpayGateway(mockSDK);
    service = new PaymentService(repository, gateway);

    mockSDK.createCalls = 0;
    mockSDK.delayMs = 6000; // Greater than 5000ms timeout
    mockSDK.transientFailuresCount = 0;
    
    // Create new order to test separately
    const TEMP_ORDER_ID = 886;
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [TEMP_ORDER_ID, 'order_temp_timeout', TEST_STUDENT_ID, 1, 'pending', 100.00]
    );

    let threwTimeout = false;
    try {
      await service.initiatePayment({
        orderId: TEMP_ORDER_ID,
        studentId: TEST_STUDENT_ID,
        paymentMethod: PaymentMethod.UPI,
        gateway: PaymentGatewayProvider.RAZORPAY,
        idempotencyKey: 'idemp-key-timeout-test'
      });
    } catch (e: any) {
      if (e instanceof ProviderApiError && e.message.includes('timed out')) {
        threwTimeout = true;
      }
    }

    assert(threwTimeout, 'Should throw ProviderApiError on gateway timeout');
    assert(mockSDK.createCalls === 4, 'Should attempt 4 times total (1 primary + 3 exponential retries) before failing');
    
    // Verify local DB payment status transitions to FAILED
    const failedPayment = await repository.findByIdempotencyKey('idemp-key-timeout-test');
    assert(failedPayment !== null && failedPayment.status === PaymentStatus.FAILED, 'Database record should be marked as FAILED after gateway timeout');
    assert(failedPayment?.errorCode !== null && failedPayment?.failedAt !== null, 'Should store error details and failure timestamp');
  } catch (e: any) {
    console.error('Test 6 failed:', e);
    failed++;
  }

  // --- Test 7: Retry Logic for Transient Failures ---
  try {
    repository = new SqlPaymentRepository();
    mockSDK = new MockRazorpaySDK();
    gateway = new RazorpayGateway(mockSDK);
    service = new PaymentService(repository, gateway);

    mockSDK.createCalls = 0;
    mockSDK.delayMs = 0;
    mockSDK.transientFailuresCount = 2; // Fail twice with network timeouts, then succeed

    const TEMP_ORDER_ID_RETRY = 885;
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [TEMP_ORDER_ID_RETRY, 'order_temp_retry', TEST_STUDENT_ID, 1, 'pending', 80.00]
    );

    const response = await service.initiatePayment({
      orderId: TEMP_ORDER_ID_RETRY,
      studentId: TEST_STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'idemp-key-retry-test'
    });

    console.log(`[Test 7 Debug] mockSDK.createCalls = ${mockSDK.createCalls}, transientFailuresCount = ${mockSDK.transientFailuresCount}`);
    assert(mockSDK.createCalls === 3, 'Should execute 3 attempts (2 transient failures + 1 success)');
    assert(response.status === PaymentStatus.INITIATED, 'Should successfully complete payment setup after transient retries');
  } catch (e: any) {
    console.error('Test 7 failed:', e);
    failed++;
  }

  // --- Test 8: Stale CREATED record recovery ---
  try {
    repository = new SqlPaymentRepository();
    mockSDK = new MockRazorpaySDK();
    gateway = new RazorpayGateway(mockSDK);
    service = new PaymentService(repository, gateway);

    // 1. Manually insert a payment record in CREATED state that is 10 minutes old
    const TEMP_ORDER_STALE = 884;
    await db.execute(
      'INSERT INTO orders (id, order_hash, student_id, shop_id, status, total_price) VALUES (?, ?, ?, ?, ?, ?)',
      [TEMP_ORDER_STALE, 'order_temp_stale', TEST_STUDENT_ID, 1, 'pending', 90.00]
    );

    const staleUuid = 'stale-uuid-12345';
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    
    await db.execute(
      `INSERT INTO payments (
        uuid, payment_reference, order_id, student_id, amount, currency, 
        status, payment_method, gateway, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [staleUuid, 'CP-PAY-STALE', TEMP_ORDER_STALE, TEST_STUDENT_ID, 9000, Currency.INR, PaymentStatus.CREATED, PaymentMethod.UPI, PaymentGatewayProvider.RAZORPAY, 'stale-idemp-key', tenMinutesAgo]
    );

    // 2. Initiate a new payment session on the same order with a different idempotency key
    mockSDK.createCalls = 0;
    mockSDK.transientFailuresCount = 0;
    mockSDK.delayMs = 0;

    const response = await service.initiatePayment({
      orderId: TEMP_ORDER_STALE,
      studentId: TEST_STUDENT_ID,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'fresh-idemp-key-after-stale'
    });

    // 3. Verify stale session is FAILED and lock is cleared for the new payment
    const cleanedStaleRecord = await repository.findByUuid(staleUuid);
    assert(cleanedStaleRecord !== null && cleanedStaleRecord.status === PaymentStatus.FAILED, 'Stale CREATED record should be recovered and set to FAILED');
    assert(cleanedStaleRecord?.errorCode === 'STALE_INITIATION_CLEANUP', 'ErrorCode should declare STALE_INITIATION_CLEANUP');
    
    assert(response.status === PaymentStatus.INITIATED, 'New payment session should successfully establish');
  } catch (e: any) {
    console.error('Test 8 failed:', e);
    failed++;
  }

  // Cleanup DB changes
  try {
    await db.execute('DELETE FROM payments WHERE student_id = ?', [TEST_STUDENT_ID]);
    await db.execute('DELETE FROM orders WHERE student_id = ?', [TEST_STUDENT_ID]);
    await db.execute('DELETE FROM users WHERE id IN (?, ?)', [TEST_STUDENT_ID, OTHER_STUDENT_ID]);
  } catch (e) {}

  console.log(`\n🏁 Phase 2 Verification Results: ${passed} passed, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 2 payment creation and security assertions passed successfully!');
    process.exit(0);
  }
}

runIntegrationTests();
