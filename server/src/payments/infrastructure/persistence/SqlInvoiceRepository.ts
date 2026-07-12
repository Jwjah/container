import { IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { Invoice } from '../../domain/entities/Invoice';
import { InvoiceStatus } from '../../domain/enums/InvoiceStatus';
import db from '../../../config/database';

export class SqlInvoiceRepository implements IInvoiceRepository {
  private toEntity(row: any): Invoice {
    return new Invoice(
      row.id,
      row.uuid,
      row.invoice_number,
      row.student_id,
      row.shop_id,
      row.order_id,
      row.order_hash,
      row.payment_uuid,
      row.payment_reference,
      row.gateway_payment_id,
      row.status as InvoiceStatus,
      row.subtotal,
      row.tax_amount,
      row.total,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(invoice: Invoice, connection?: any): Promise<Invoice> {
    const executor = connection || db;
    const [result] = await executor.execute(
      `INSERT INTO invoices (
        uuid, invoice_number, student_id, shop_id, order_id, order_hash, 
        payment_uuid, payment_reference, gateway_payment_id, status, subtotal, tax_amount, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice.uuid,
        invoice.invoiceNumber,
        invoice.studentId,
        invoice.shopId,
        invoice.orderId,
        invoice.orderHash,
        invoice.paymentUuid,
        invoice.paymentReference,
        invoice.gatewayPaymentId,
        invoice.status,
        invoice.subtotal,
        invoice.taxAmount,
        invoice.total
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new Invoice(
      insertedId,
      invoice.uuid,
      invoice.invoiceNumber,
      invoice.studentId,
      invoice.shopId,
      invoice.orderId,
      invoice.orderHash,
      invoice.paymentUuid,
      invoice.paymentReference,
      invoice.gatewayPaymentId,
      invoice.status,
      invoice.subtotal,
      invoice.taxAmount,
      invoice.total,
      new Date(),
      new Date()
    );
  }

  public async findByOrderId(orderId: number, connection?: any): Promise<Invoice | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM invoices WHERE order_id = ?', [orderId]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async getNextSequenceValue(connection?: any): Promise<number> {
    const executor = connection || db;
    const [result] = await executor.execute("REPLACE INTO invoice_sequence (stub) VALUES ('a')");
    return result.insertId || result.lastID;
  }
}
