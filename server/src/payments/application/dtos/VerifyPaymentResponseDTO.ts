import { PaymentStatus } from '../../domain/enums/PaymentStatus';

export interface VerifyPaymentResponseDTO {
  uuid: string;
  paymentReference: string;
  status: PaymentStatus;
  verifiedAt: Date | null;
}
