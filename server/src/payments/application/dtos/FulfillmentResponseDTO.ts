export interface FulfillmentResponseDTO {
  id: number;
  orderId: number;
  printJobId: number;
  shopId: number;
  studentId: number;
  status: string;
  mode: string;
  assignedAgentId: number | null;
  otpExpiresAt: string | null;
  otpAttempts: number;
  deliveryAttempts: number;
  proofOfDeliveryReference: string | null;
  failureReason: string | null;
  estimatedDeliveryAt: string | null;
  actualDeliveryAt: string | null;
  otpVerifiedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
