import { CreatePaymentDTO } from '../dtos/CreatePaymentDTO';
import { PaymentResponseDTO } from '../dtos/PaymentResponseDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';

export interface IPaymentService {
  /**
   * Initiates payment for a print order, performing ownership verification,
   * server-side amount calculation, active session checks, and calling Razorpay.
   */
  initiatePayment(dto: CreatePaymentDTO, correlationId?: CorrelationId): Promise<PaymentResponseDTO>;
}
