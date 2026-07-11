import { PaymentMethod } from '../../domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from '../../domain/enums/PaymentGatewayProvider';

export interface CreatePaymentDTO {
  orderId: number;
  studentId: number;
  paymentMethod: PaymentMethod;
  gateway: PaymentGatewayProvider;
  idempotencyKey: string;
}
