import { Fulfillment } from '../domain/entities/Fulfillment';

export interface IFulfillmentRepository {
  create(fulfillment: Fulfillment, connection?: any): Promise<Fulfillment>;
  findById(id: number, connection?: any): Promise<Fulfillment | null>;
  findByOrderId(orderId: number, connection?: any): Promise<Fulfillment | null>;
  findByPrintJobId(printJobId: number, connection?: any): Promise<Fulfillment | null>;
  findByIdForUpdate(id: number, connection?: any): Promise<Fulfillment | null>;
  update(fulfillment: Fulfillment, connection?: any): Promise<void>;
}
