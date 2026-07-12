import { PrintJob } from '../domain/entities/PrintJob';

export interface IPrintJobRepository {
  create(job: PrintJob, connection?: any): Promise<PrintJob>;
  findByOrderId(orderId: number, connection?: any): Promise<PrintJob | null>;
  findById(id: number, connection?: any): Promise<PrintJob | null>;
  findByIdForUpdate(id: number, connection?: any): Promise<PrintJob | null>;
  findByShopIdAndStatus(shopId: number, statuses: string[], connection?: any): Promise<PrintJob[]>;
  update(printJob: PrintJob, connection?: any): Promise<void>;
}
