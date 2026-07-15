/**
 * AnalyticsSnapshot — point-in-time checkpoint of aggregated metrics for fast replay recovery.
 * RFC-010 Specification
 */
export class AnalyticsSnapshot {
  constructor(
    public readonly id: number | null,
    public readonly snapshotDate: string,   // YYYY-MM-DD
    public readonly totalOrders: number,
    public readonly totalRevenue: number,
    public readonly totalCompleted: number,
    public readonly totalCancelled: number,
    public readonly lastEventSequence: number,
    public readonly stateData: string,      // JSON blob of full state
    public readonly createdAt: Date = new Date()
  ) {}
}
