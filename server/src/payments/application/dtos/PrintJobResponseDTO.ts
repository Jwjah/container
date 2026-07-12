export interface PrintJobResponseDTO {
  id: number;
  orderId: number;
  shopId: number;
  studentId: number;
  status: string;
  priority: number;
  version: number;
  lastStatusChangedAt: string | null;
  acceptedAt: string | null;
  printingStartedAt: string | null;
  readyAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  cancellationReasonCode: string | null;
  cancellationDescription: string | null;
  estimatedCompletionAt: string | null;
  createdAt: string;
  updatedAt: string;
}
