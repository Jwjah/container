import { Payment } from '../domain/entities/Payment';
import { PaymentStatus } from '../domain/enums/PaymentStatus';
import { PaymentMethod } from '../domain/enums/PaymentMethod';

export interface GatewaySession {
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  checkoutUrl?: string; // Redirect URL for hosted checkouts (e.g. Stripe checkout)
  providerRawResponse: any;
}

export interface NormalizedWebhookEvent {
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  status: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  amount?: number | null; // in minor units (paise)
  errorCode?: string | null;
  errorMessage?: string | null;
  providerMetadata?: Record<string, any> | null;
  rawEvent: any;
}

export interface IPaymentGateway {
  /**
   * Creates an order session on the external payment provider gateway.
   */
  createSession(payment: Payment): Promise<GatewaySession>;

  /**
   * Verifies that the incoming webhook payload signature matches the provider secret key.
   * Splits verification from payload extraction/parsing.
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): Promise<boolean>;

  /**
   * Parses the raw gateway payload and normalizes it into a unified transaction event.
   */
  parseWebhookEvent(payload: any): Promise<NormalizedWebhookEvent>;
}
