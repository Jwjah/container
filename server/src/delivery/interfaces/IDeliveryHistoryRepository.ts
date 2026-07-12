import { DeliveryHistory } from '../domain/entities/DeliveryHistory';

export interface IDeliveryHistoryRepository {
  create(history: DeliveryHistory, connection?: any): Promise<DeliveryHistory>;
  findByAssignmentId(assignmentId: number, connection?: any): Promise<DeliveryHistory[]>;
}
