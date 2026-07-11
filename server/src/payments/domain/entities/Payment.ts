import { PaymentStatus } from '../enums/PaymentStatus';
import { PaymentMethod } from '../enums/PaymentMethod';
import { PaymentGatewayProvider } from '../enums/PaymentGatewayProvider';
import { Currency } from '../enums/Currency';
import { VerificationSource } from '../enums/VerificationSource';

export interface Payment {
  id?: number;
  uuid: string;
  paymentReference: string;
  orderId: number;
  studentId: number;
  amount: number; // in minor currency units (paise for INR)
  currency: Currency;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  gateway: PaymentGatewayProvider;
  idempotencyKey: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  gatewaySignature?: string | null;
  verificationMethod?: VerificationSource | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerMetadata?: Record<string, any> | null;
  verifiedAt?: Date | null;
  capturedAt?: Date | null;
  failedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
