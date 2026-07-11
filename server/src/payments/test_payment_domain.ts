import { PaymentStatus } from './domain/enums/PaymentStatus';
import { PaymentMethod } from './domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from './domain/enums/PaymentGatewayProvider';
import { Currency } from './domain/enums/Currency';
import { Payment } from './domain/entities/Payment';
import { PaymentStateMachine } from './domain/transitions/PaymentStateMachine';
import { PaymentValidator } from './domain/validation/PaymentValidator';
import { InvalidStateTransitionError, PaymentValidationError } from './domain/errors/PaymentErrors';

function runTests() {
  console.log('🧪 Starting Payment Domain Foundation Verification Tests...\n');

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

  // --- Test 1: State Machine Transition Logic ---
  try {
    // Valid: CREATED -> INITIATED
    assert(PaymentStateMachine.isValidTransition(PaymentStatus.CREATED, PaymentStatus.INITIATED), 'CREATED -> INITIATED should be allowed');
    
    // Valid: INITIATED -> PENDING_VERIFICATION
    assert(PaymentStateMachine.isValidTransition(PaymentStatus.INITIATED, PaymentStatus.PENDING_VERIFICATION), 'INITIATED -> PENDING_VERIFICATION should be allowed');
    
    // Valid: PENDING_VERIFICATION -> CAPTURED
    assert(PaymentStateMachine.isValidTransition(PaymentStatus.PENDING_VERIFICATION, PaymentStatus.CAPTURED), 'PENDING_VERIFICATION -> CAPTURED should be allowed');

    // Valid: CAPTURED -> PARTIALLY_REFUNDED
    assert(PaymentStateMachine.isValidTransition(PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED), 'CAPTURED -> PARTIALLY_REFUNDED should be allowed');

    // Invalid: CREATED -> CAPTURED
    assert(!PaymentStateMachine.isValidTransition(PaymentStatus.CREATED, PaymentStatus.CAPTURED), 'CREATED -> CAPTURED should not be allowed');

    // Invalid: FAILED -> INITIATED (terminal state check)
    assert(!PaymentStateMachine.isValidTransition(PaymentStatus.FAILED, PaymentStatus.INITIATED), 'FAILED -> INITIATED should not be allowed');

    // Test verifyTransition exception throwing
    let threwException = false;
    try {
      PaymentStateMachine.verifyTransition(PaymentStatus.FAILED, PaymentStatus.CAPTURED);
    } catch (e) {
      if (e instanceof InvalidStateTransitionError) {
        threwException = true;
      }
    }
    assert(threwException, 'verifyTransition should throw InvalidStateTransitionError on bad transition');

    // Terminal state verification
    assert(PaymentStateMachine.isTerminalState(PaymentStatus.FAILED), 'FAILED should be recognized as a terminal state');
    assert(PaymentStateMachine.isTerminalState(PaymentStatus.VOIDED), 'VOIDED should be recognized as a terminal state');
    assert(!PaymentStateMachine.isTerminalState(PaymentStatus.CREATED), 'CREATED should not be a terminal state');

  } catch (e: any) {
    console.error('Error running State Machine tests:', e);
    failed++;
  }

  // --- Test 2: Invariant Input Validator Logic ---
  try {
    const validParams = {
      orderId: 101,
      studentId: 5,
      amount: 15000, // ₹150.00
      currency: Currency.INR,
      paymentMethod: PaymentMethod.UPI,
      gateway: PaymentGatewayProvider.RAZORPAY,
      idempotencyKey: 'test-key-12345'
    };

    // Should run without error
    let validatorPassed = true;
    try {
      PaymentValidator.validateCreatePayment(validParams);
    } catch (e) {
      validatorPassed = false;
    }
    assert(validatorPassed, 'PaymentValidator should accept valid creation params');

    // Should throw error on zero amount
    let threwOnZero = false;
    try {
      PaymentValidator.validateCreatePayment({ ...validParams, amount: 0 });
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Amount must be a positive integer')) {
        threwOnZero = true;
      }
    }
    assert(threwOnZero, 'PaymentValidator should reject zero amount');

    // Should throw error on negative amount
    let threwOnNegative = false;
    try {
      PaymentValidator.validateCreatePayment({ ...validParams, amount: -500 });
    } catch (e) {
      if (e instanceof PaymentValidationError) {
        threwOnNegative = true;
      }
    }
    assert(threwOnNegative, 'PaymentValidator should reject negative amount');

    // Should throw error on empty idempotency key
    let threwOnEmptyKey = false;
    try {
      PaymentValidator.validateCreatePayment({ ...validParams, idempotencyKey: ' ' });
    } catch (e) {
      if (e instanceof PaymentValidationError && e.message.includes('Idempotency key is required')) {
        threwOnEmptyKey = true;
      }
    }
    assert(threwOnEmptyKey, 'PaymentValidator should reject empty/whitespace idempotency key');

  } catch (e: any) {
    console.error('Error running Validator tests:', e);
    failed++;
  }

  // --- Test 3: Type Conformity and Interfaces ---
  try {
    const paymentEntity: Payment = {
      uuid: 'c8087ab9-fc2b-4228-a532-602ef59846b0',
      paymentReference: 'CP-PAY-20260711-8931',
      orderId: 101,
      studentId: 5,
      amount: 15000,
      currency: Currency.INR,
      status: PaymentStatus.CREATED,
      paymentMethod: PaymentMethod.CARD,
      gateway: PaymentGatewayProvider.STRIPE,
      idempotencyKey: 'test-idempotency-key-unique',
      verifiedAt: null,
      failedAt: null,
      providerMetadata: {
        stripe_payment_intent_id: 'pi_123456789'
      }
    };
    
    assert(paymentEntity.amount === 15000, 'Entity attributes should be correctly initialized and typed');
    assert(paymentEntity.providerMetadata?.stripe_payment_intent_id === 'pi_123456789', 'Provider metadata dictionary should store arbitrary gateway details');

  } catch (e: any) {
    console.error('Error running entity type checks:', e);
    failed++;
  }

  console.log(`\n🏁 Verification Results: ${passed} passed, ${failed} failed.`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Payment Domain Foundation contracts are fully compliant!');
    process.exit(0);
  }
}

runTests();
