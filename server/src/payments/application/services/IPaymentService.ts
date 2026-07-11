import { CreatePaymentDTO } from '../dtos/CreatePaymentDTO';
import { PaymentResponseDTO } from '../dtos/PaymentResponseDTO';
import { VerifyPaymentDTO } from '../dtos/VerifyPaymentDTO';
import { VerifyPaymentResponseDTO } from '../dtos/VerifyPaymentResponseDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export interface IPaymentService {
  /**
   * Initiates payment for a print order, performing ownership verification,
   * server-side amount calculation, active session checks, and calling Razorpay.
   */
  initiatePayment(dto: CreatePaymentDTO, correlationId?: CorrelationId): Promise<PaymentResponseDTO>;

  /**
   * Verifies an client-submitted payment session using gateway order, payment and signature checks.
   */
  verifyPayment(
    dto: VerifyPaymentDTO,
    studentId: number,
    correlationId?: CorrelationId
  ): Promise<VerifyPaymentResponseDTO>;

  /**
   * Safe public entrypoint for processing Razorpay webhooks asynchronously, enforcing idempotency.
   */
  processWebhook(
    payload: any,
    headers: any,
    signature: string,
    rawPayload: string | Buffer,
    correlationId?: CorrelationId
  ): Promise<string | null>;
}
