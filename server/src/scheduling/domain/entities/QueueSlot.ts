import { QueueStatus } from '../enums/QueueStatus';

/**
 * QueueSlot — entity representing a scheduled time segment on a printer.
 *
 * RFC-008 Refinement 2 Specification (Managed child of Printer aggregate)
 */
export class QueueSlot {
  constructor(
    public id: number | null,
    public readonly shopId: number,
    public readonly orderId: number,
    public printerId: number | null,
    public queuePosition: number,
    public estimatedStartTime: Date,
    public estimatedCompletionTime: Date,
    public readonly pagesCount: number,
    public readonly duplex: boolean,
    public readonly color: boolean,
    public status: QueueStatus,
    public version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (pagesCount <= 0) {
      throw new Error('pagesCount must be positive');
    }
  }

  /**
   * Shift the time window of this queue slot.
   */
  public shiftWindow(start: Date, end: Date): void {
    this.estimatedStartTime = start;
    this.estimatedCompletionTime = end;
    this.updatedAt = new Date();
  }

  /**
   * Update position index.
   */
  public updatePosition(pos: number): void {
    this.queuePosition = pos;
    this.updatedAt = new Date();
  }

  /**
   * Update execution status state.
   */
  public updateStatus(status: QueueStatus): void {
    this.status = status;
    this.updatedAt = new Date();
  }
}
