import { DeliveryAssignment } from '../domain/entities/DeliveryAssignment';

export interface IDeliveryAssignmentRepository {
  create(assignment: DeliveryAssignment, connection?: any): Promise<DeliveryAssignment>;
  findById(id: number, connection?: any): Promise<DeliveryAssignment | null>;
  findByIdForUpdate(id: number, connection?: any): Promise<DeliveryAssignment | null>;
  findActiveByAgentId(agentId: number, connection?: any): Promise<DeliveryAssignment | null>;
  findActiveByFulfillmentId(fulfillmentId: number, connection?: any): Promise<DeliveryAssignment | null>;
  findPendingAssignments(connection?: any): Promise<DeliveryAssignment[]>;
  findByCorrelationId(correlationId: string, connection?: any): Promise<DeliveryAssignment[]>;
  update(assignment: DeliveryAssignment, connection?: any): Promise<void>;
}
