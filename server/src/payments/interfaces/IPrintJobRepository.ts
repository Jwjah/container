import { PrintJob } from '../domain/entities/PrintJob';

export interface IPrintJobRepository {
  create(job: PrintJob, connection?: any): Promise<PrintJob>;
  findByOrderId(orderId: number, connection?: any): Promise<PrintJob | null>;
}
