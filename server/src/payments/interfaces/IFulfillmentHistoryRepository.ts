import { FulfillmentHistory } from '../domain/entities/FulfillmentHistory';

export interface IFulfillmentHistoryRepository {
  create(history: FulfillmentHistory, connection?: any): Promise<FulfillmentHistory>;
  findByFulfillmentId(fulfillmentId: number, connection?: any): Promise<FulfillmentHistory[]>;
}
