import { DeliveryAssignment } from '../../domain/entities/DeliveryAssignment';

export interface DeliveryResponseDTO {
  id: number;
  fulfillmentId: number;
  orderId: number;
  shopId: number;
  studentId: number;
  agentId: number;
  status: string;
  correlationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function mapDeliveryToDTO(a: DeliveryAssignment): DeliveryResponseDTO {
  return {
    id: a.id,
    fulfillmentId: a.fulfillmentId,
    orderId: a.orderId,
    shopId: a.shopId,
    studentId: a.studentId,
    agentId: a.agentId,
    status: a.status,
    correlationId: a.correlationId,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString()
  };
}
