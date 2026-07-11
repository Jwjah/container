import { PaymentStatus } from '../../domain/enums/PaymentStatus';
import { PaymentMethod } from '../../domain/enums/PaymentMethod';
import { PaymentGatewayProvider } from '../../domain/enums/PaymentGatewayProvider';
import { Currency } from '../../domain/enums/Currency';

export interface PaymentResponseDTO {
  uuid: string;
  paymentReference: string;
  orderId: number;
  studentId: number;
  amount: number; // in minor units
  currency: Currency;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  gateway: PaymentGatewayProvider;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  verifiedAt?: Date | null;
  failedAt?: Date | null;
  createdAt?: Date;
}
