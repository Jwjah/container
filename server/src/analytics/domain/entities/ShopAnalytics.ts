/**
 * ShopAnalytics — per-shop rolling aggregate.
 * RFC-010 Specification
 */
export class ShopAnalytics {
  constructor(
    public readonly id: number | null,
    public readonly shopId: number,
    public totalOrders: number,
    public completedOrders: number,
    public cancelledOrders: number,
    public totalRevenue: number,
    public avgCompletionTimeSecs: number,
    public avgDeliveryTimeSecs: number,
    public printerUtilizationPct: number,   // 0.0–1.0
    public queueUtilizationPct: number,     // 0.0–1.0
    public lowStockEvents: number,
    public readonly version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  get successRate(): number {
    return this.totalOrders > 0 ? this.completedOrders / this.totalOrders : 0;
  }
}
