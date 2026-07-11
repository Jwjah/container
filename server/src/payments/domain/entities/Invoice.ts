import { InvoiceStatus } from '../enums/InvoiceStatus';
import { Order } from './Order';

export class Invoice {
  constructor(
    public readonly id: number | null,
    public readonly uuid: string,
    public readonly invoiceNumber: string,
    public readonly studentId: number,
    public readonly shopId: number,
    public readonly orderId: number,
    public readonly orderHash: string,
    public readonly paymentUuid: string,
    public readonly paymentReference: string,
    public readonly gatewayPaymentId: string,
    public readonly status: InvoiceStatus,
    public readonly subtotal: number,
    public readonly taxAmount: number,
    public readonly total: number,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}

  public static createFromOrder(
    order: Order,
    invoiceNumber: string,
    invoiceUuid: string
  ): Invoice {
    return new Invoice(
      null,
      invoiceUuid,
      invoiceNumber,
      order.studentId,
      order.shopId,
      order.id,
      order.orderHash,
      order.paymentUuid!,
      order.paymentReference!,
      order.gatewayPaymentId || '',
      InvoiceStatus.PAID,
      order.totalPrice,
      0.00, // GST to be added in future phases
      order.totalPrice
    );
  }
}
