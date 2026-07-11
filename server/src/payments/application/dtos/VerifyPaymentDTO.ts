export interface VerifyPaymentDTO {
  paymentUuid: string;
  gatewayPaymentId?: string;
  gatewayOrderId?: string;
  signature?: string;
  rawProviderPayload?: any;
}
