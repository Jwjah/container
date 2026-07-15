/**
 * AnalyticsMetric — daily platform-wide aggregate fact.
 * RFC-010 Specification
 */
export class AnalyticsMetric {
  constructor(
    public readonly id: number | null,
    public readonly date: string,           // YYYY-MM-DD
    public totalOrders: number,
    public totalRevenue: number,
    public completedOrders: number,
    public cancelledOrders: number,
    public avgCompletionTimeSecs: number,   // seconds from order_created to print_completed
    public avgDeliveryTimeSecs: number,     // seconds from print_completed to delivery_completed
    public lowStockEvents: number,
    public readonly version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  get successRate(): number {
    return this.totalOrders > 0 ? this.completedOrders / this.totalOrders : 0;
  }

  get cancellationRate(): number {
    return this.totalOrders > 0 ? this.cancelledOrders / this.totalOrders : 0;
  }
}
