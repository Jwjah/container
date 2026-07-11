import { Invoice } from '../domain/entities/Invoice';

export interface IInvoiceRepository {
  create(invoice: Invoice, connection?: any): Promise<Invoice>;
  findByOrderId(orderId: number, connection?: any): Promise<Invoice | null>;
  getNextSequenceValue(connection?: any): Promise<number>;
}
