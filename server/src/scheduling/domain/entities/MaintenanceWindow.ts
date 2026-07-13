/**
 * MaintenanceWindow — entity representing a scheduled downtime block on a printer.
 *
 * RFC-008 Refinement 2 Specification (Managed child of Printer aggregate)
 */
export class MaintenanceWindow {
  constructor(
    public id: number | null,
    public readonly printerId: number,
    public readonly startTime: Date,
    public readonly endTime: Date,
    public readonly reason: string,
    public readonly createdAt: Date = new Date()
  ) {
    if (endTime <= startTime) {
      throw new Error('Maintenance endTime must be after startTime');
    }
  }

  /**
   * Helper to check if a specific time overlaps with this maintenance window.
   */
  public overlaps(start: Date, end: Date): boolean {
    return this.startTime < end && start < this.endTime;
  }
}
