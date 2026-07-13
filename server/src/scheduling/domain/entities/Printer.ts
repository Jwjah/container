import { PrinterStatus } from '../enums/PrinterStatus';
import { PrinterCapabilities } from '../value-objects/PrinterCapabilities';
import { QueueSlot } from './QueueSlot';
import { MaintenanceWindow } from './MaintenanceWindow';
import { QueueStatus } from '../enums/QueueStatus';

/**
 * Printer — Aggregate Root managing physical capabilities, scheduled queues, and downtime blocks.
 *
 * RFC-008 Refinement 2 Specification
 */
export class Printer {
  private _slots: QueueSlot[] = [];
  private _maintenanceWindows: MaintenanceWindow[] = [];

  constructor(
    public id: number | null,
    public readonly shopId: number,
    public name: string,
    public status: PrinterStatus,
    public capabilities: PrinterCapabilities,
    slots: QueueSlot[] = [],
    maintenanceWindows: MaintenanceWindow[] = [],
    public version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    this._slots = [...slots].sort((a, b) => a.queuePosition - b.queuePosition);
    this._maintenanceWindows = [...maintenanceWindows];
  }

  public get slots(): QueueSlot[] {
    return [...this._slots];
  }

  public get maintenanceWindows(): MaintenanceWindow[] {
    return [...this._maintenanceWindows];
  }

  /**
   * Evaluates if this printer can execute a print request configuration.
   */
  public canProcess(requirements: {
    color: boolean;
    duplex: boolean;
    paperSize: string;
    paperWeight?: number;
    mediaType?: string;
  }): boolean {
    if (this.status === PrinterStatus.OFFLINE) return false;
    return this.capabilities.isCompatible(requirements);
  }

  /**
   * Adds a new queue slot, assigning its position and keeping slots sorted.
   */
  public addQueueSlot(slot: QueueSlot): void {
    if (!this.capabilities.isCompatible({
      color: slot.color,
      duplex: slot.duplex,
      paperSize: 'A4' // default paper size validation
    })) {
      throw new Error(`Queue slot details are incompatible with Printer capabilities.`);
    }

    slot.printerId = this.id;
    // Assign position
    const nextPos = this._slots.length > 0
      ? Math.max(...this._slots.map(s => s.queuePosition)) + 1
      : 1;
    slot.updatePosition(nextPos);

    this._slots.push(slot);
    this.sortAndShiftSlots();
  }

  /**
   * Removes a slot (e.g. order cancelled), updating the remaining queue positions and ETAs.
   */
  public removeQueueSlot(orderId: number): void {
    const idx = this._slots.findIndex(s => s.orderId === orderId);
    if (idx === -1) return;

    this._slots.splice(idx, 1);
    this.sortAndShiftSlots();
  }

  /**
   * Adds a maintenance window, shifting overlapping slots accordingly.
   */
  public addMaintenanceWindow(window: MaintenanceWindow): void {
    this._maintenanceWindows.push(window);
    this.sortAndShiftSlots();
  }

  /**
   * Resets status.
   */
  public updateStatus(status: PrinterStatus): void {
    this.status = status;
    this.updatedAt = new Date();
    if (status === PrinterStatus.OFFLINE) {
      // Offline printers cannot host active slots. They should be shifted/rescheduled by service.
      this._slots.forEach(s => {
        if (s.status === QueueStatus.PENDING) {
          s.printerId = null;
        }
      });
      this._slots = this._slots.filter(s => s.status !== QueueStatus.PENDING);
    }
  }

  /**
   * Sorts queue slots by position and recalculates times based on print duration + warm-up + gaps + maintenance.
   */
  public sortAndShiftSlots(): void {
    this._slots.sort((a, b) => a.queuePosition - b.queuePosition);
    this.updatedAt = new Date();

    let nextAvailableTime = new Date();

    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      slot.updatePosition(i + 1);

      if (slot.status === QueueStatus.COMPLETED || slot.status === QueueStatus.CANCELLED) {
        continue;
      }

      // 1. Calculate duration (pages / ppm)
      const printDurationMs = Math.ceil((slot.pagesCount / this.capabilities.pagesPerMinute) * 60 * 1000);
      const warmUpMs = this.capabilities.warmupTimeSeconds * 1000;
      
      // Duplex check (adds manual reloading latency of 90s if duplex is requested but printer lacks automatic duplexing support)
      const duplexReloadMs = (slot.duplex && !this.capabilities.duplexSupported) ? 90 * 1000 : 0;
      const totalDurationMs = printDurationMs + warmUpMs + duplexReloadMs;

      // 2. Set tentative start time
      let proposedStart = new Date(Math.max(Date.now(), nextAvailableTime.getTime()));

      // 3. Shift forward if it overlaps with any MaintenanceWindow
      for (const window of this._maintenanceWindows) {
        const proposedEnd = new Date(proposedStart.getTime() + totalDurationMs);
        if (window.overlaps(proposedStart, proposedEnd)) {
          proposedStart = new Date(window.endTime.getTime() + 1000); // 1s buffer after maintenance
        }
      }

      const finalEnd = new Date(proposedStart.getTime() + totalDurationMs);
      slot.shiftWindow(proposedStart, finalEnd);
      nextAvailableTime = finalEnd;
    }
  }
}
