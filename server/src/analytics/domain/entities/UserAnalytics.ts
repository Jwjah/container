/**
 * UserAnalytics — per-user activity aggregate.
 * RFC-010 Specification
 */
export class UserAnalytics {
  constructor(
    public readonly id: number | null,
    public readonly userId: number,
    public totalOrders: number,
    public completedOrders: number,
    public cancelledOrders: number,
    public totalSpend: number,
    public avgOrderValue: number,
    public lastOrderAt: Date | null,
    public readonly version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}
}
