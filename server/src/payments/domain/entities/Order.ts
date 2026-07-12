import { OrderStatus } from '../enums/OrderStatus';

export class Order {
  constructor(
    public readonly id: number,
    public readonly orderHash: string,
    public readonly studentId: number,
    public readonly shopId: number,
    public status: OrderStatus,
    public readonly totalPrice: number,
    public paymentReference: string | null = null,
    public paymentUuid: string | null = null,
    public gatewayPaymentId: string | null = null,
    public paidAt: Date | null = null,
    public readonly createdAt: Date = new Date()
  ) {}

  public markPaid(paymentRef: string, paymentUuid: string, gatewayPaymentId: string): void {
    if (this.status === OrderStatus.PAID) {
      return; // Already paid (idempotent no-op)
    }
    if (this.status !== OrderStatus.PENDING_PAYMENT) {
      throw new Error(`Ineligible order status transition to PAID from ${this.status}`);
    }
    this.status = OrderStatus.PAID;
    this.paymentReference = paymentRef;
    this.paymentUuid = paymentUuid;
    this.gatewayPaymentId = gatewayPaymentId;
    this.paidAt = new Date();
  }
}
