import { WebhookProcessingStatus } from '../enums/WebhookProcessingStatus';

export interface WebhookEvent {
  id?: number;
  eventId: string;
  eventType: string;
  paymentUuid?: string | null;
  paymentReference?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  payload: string;
  headers: string;
  signature: string;
  payloadHash: string;
  processingStatus: WebhookProcessingStatus;
  errorMessage?: string | null;
  processedAt?: Date | null;
  createdAt?: Date;
}
