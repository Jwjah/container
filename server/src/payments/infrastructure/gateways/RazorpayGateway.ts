import { IPaymentGateway, GatewaySession, NormalizedWebhookEvent } from '../../interfaces/IPaymentGateway';
import { Payment } from '../../domain/entities/Payment';
import { ProviderApiError } from '../../domain/errors/PaymentErrors';
import { PaymentStatus } from '../../domain/enums/PaymentStatus';
import Razorpay from 'razorpay';
import crypto from 'crypto';

export class RazorpayGateway implements IPaymentGateway {
  private razorpay: any;
  private readonly TIMEOUT_MS = 5000;
  private readonly MAX_RETRIES = 3;

  constructor(razorpayClient?: any) {
    this.razorpay = razorpayClient || new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
    });
  }

  public async createSession(payment: Payment): Promise<GatewaySession> {
    const executeCall = async () => {
      return this.razorpay.orders.create({
        amount: payment.amount, // in paise
        currency: payment.currency,
        receipt: payment.paymentReference,
        notes: {
          orderId: payment.orderId.toString(),
          studentId: payment.studentId.toString(),
          uuid: payment.uuid
        }
      });
    };

    try {
      // Execute the order creation with timeout and retry logic
      const order = await this.retry(
        async () => this.timeout(executeCall(), this.TIMEOUT_MS, 'Razorpay order creation timed out'),
        this.MAX_RETRIES,
        1000,
        2
      );

      return {
        gatewayOrderId: order.id,
        providerRawResponse: order
      };
    } catch (err: any) {
      throw new ProviderApiError('RAZORPAY', err.message || 'Order creation failed', err);
    }
  }

  public async verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): Promise<boolean> {
    try {
      const payloadStr = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');
      return expectedSignature === signature;
    } catch (err) {
      return false;
    }
  }

  public async parseWebhookEvent(payload: any): Promise<NormalizedWebhookEvent> {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity) {
      throw new Error('Invalid webhook payload structure');
    }

    const gatewayOrderId = paymentEntity.order_id || null;
    const gatewayPaymentId = paymentEntity.id || null;
    const amount = paymentEntity.amount ? Number(paymentEntity.amount) : null;
    const currency = paymentEntity.currency || null;

    let status = PaymentStatus.PENDING_VERIFICATION;
    if (payload.event === 'payment.captured') {
      status = PaymentStatus.CAPTURED;
    } else if (payload.event === 'payment.failed') {
      status = PaymentStatus.FAILED;
    }

    return {
      gatewayOrderId,
      gatewayPaymentId,
      status,
      amount,
      currency,
      errorCode: paymentEntity.error_code || null,
      errorMessage: paymentEntity.error_description || null,
      rawEvent: payload
    };
  }

  public async verifyPaymentSignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
    try {
      const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
      const text = orderId + '|' + paymentId;
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(text)
        .digest('hex');
      return generatedSignature === signature;
    } catch (err) {
      return false;
    }
  }

  /**
   * Helper utility wrapping a promise with a timeout rejection.
   */
  private timeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, ms);
    });

    return Promise.race([
      promise.then((res) => {
        clearTimeout(timer);
        return res;
      }),
      timeoutPromise
    ]);
  }

  /**
   * Helper utility executing a promise function with a retry strategy for transient errors.
   */
  private async retry<T>(
    fn: () => Promise<T>,
    retriesLeft: number,
    delay: number,
    backoff: number
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      if (retriesLeft <= 0 || !this.isTransientError(err)) {
        throw err;
      }
      console.warn(`[RazorpayGateway] Transient error: "${err.message}". Retrying in ${delay}ms... (${retriesLeft} retries remaining).`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retry(fn, retriesLeft - 1, delay * backoff, backoff);
    }
  }

  /**
   * Identifies transient errors that are safe to retry (timeouts, 5xx server issues, etc.)
   */
  private isTransientError(err: any): boolean {
    const msg = err.message || '';
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('Timeout')) {
      return true;
    }

    // Check status codes from axios or error object properties
    const statusCode = err.statusCode || err.status;
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Node network level errors
    const codes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];
    if (err.code && codes.includes(err.code)) {
      return true;
    }

    return false;
  }
}
