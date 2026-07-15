/**
 * OrderFact — immutable per-order analytics fact record.
 * RFC-010 Specification
 */
export class OrderFact {
  constructor(
    public readonly id: number | null,
    public readonly orderId: number,
    public readonly shopId: number,
    public readonly userId: number,
    public readonly date: string,           // YYYY-MM-DD of creation
    public revenue: number,
    public pageCount: number,
    public isColor: boolean,
    public orderCreatedAt: Date,
    public paymentConfirmedAt: Date | null,
    public printStartedAt: Date | null,
    public printCompletedAt: Date | null,
    public deliveryCompletedAt: Date | null,
    public cancelledAt: Date | null,
    public readonly createdAt: Date = new Date()
  ) {}

  get completionTimeSecs(): number | null {
    if (!this.orderCreatedAt || !this.printCompletedAt) return null;
    return (this.printCompletedAt.getTime() - this.orderCreatedAt.getTime()) / 1000;
  }

  get deliveryTimeSecs(): number | null {
    if (!this.printCompletedAt || !this.deliveryCompletedAt) return null;
    return (this.deliveryCompletedAt.getTime() - this.printCompletedAt.getTime()) / 1000;
  }

  get isCompleted(): boolean {
    return this.printCompletedAt !== null;
  }

  get isCancelled(): boolean {
    return this.cancelledAt !== null;
  }
}
