import { PaymentMethod } from '../enums/PaymentMethod';
import { PaymentGatewayProvider } from '../enums/PaymentGatewayProvider';
import { Currency } from '../enums/Currency';
import { PaymentValidationError } from '../errors/PaymentErrors';

export class PaymentValidator {
  /**
   * Validates creation parameters for a new payment.
   */
  public static validateCreatePayment(params: {
    orderId: number;
    studentId: number;
    amount: number;
    currency: Currency;
    paymentMethod: PaymentMethod;
    gateway: PaymentGatewayProvider;
    idempotencyKey: string;
  }): void {
    if (!params.orderId || !Number.isInteger(params.orderId) || params.orderId <= 0) {
      throw new PaymentValidationError('OrderId must be a positive integer');
    }

    if (!params.studentId || !Number.isInteger(params.studentId) || params.studentId <= 0) {
      throw new PaymentValidationError('StudentId must be a positive integer');
    }

    if (params.amount === undefined || params.amount === null || !Number.isInteger(params.amount) || params.amount <= 0) {
      throw new PaymentValidationError('Amount must be a positive integer in minor units (paise)');
    }

    if (!params.currency || params.currency !== Currency.INR) {
      throw new PaymentValidationError('Currency must be INR');
    }

    if (!params.paymentMethod || !Object.values(PaymentMethod).includes(params.paymentMethod)) {
      throw new PaymentValidationError(`Invalid payment method: ${params.paymentMethod}`);
    }

    if (!params.gateway || !Object.values(PaymentGatewayProvider).includes(params.gateway)) {
      throw new PaymentValidationError(`Invalid gateway provider: ${params.gateway}`);
    }

    if (!params.idempotencyKey || typeof params.idempotencyKey !== 'string' || params.idempotencyKey.trim().length === 0) {
      throw new PaymentValidationError('Idempotency key is required and must be a non-empty string');
    }
  }
}
