import { ISchedulingStrategy } from './ISchedulingStrategy';
import { Printer } from '../../domain/entities/Printer';
import { QueueStatus } from '../../domain/enums/QueueStatus';

export class ECTSchedulingStrategy implements ISchedulingStrategy {
  public assignPrinter(
    printers: Printer[],
    req: {
      pagesCount: number;
      duplex: boolean;
      color: boolean;
      paperSize: string;
      paperWeight?: number;
      mediaType?: string;
    }
  ): Printer | null {
    const compatible = printers.filter(p => p.canProcess(req));
    if (compatible.length === 0) return null;

    let bestPrinter: Printer | null = null;
    let earliestCompletionTime = Infinity;

    const now = Date.now();

    for (const printer of compatible) {
      // 1. Calculate duration parameters
      const printDurationMs = Math.ceil((req.pagesCount / printer.capabilities.pagesPerMinute) * 60 * 1000);
      const warmUpMs = printer.capabilities.warmupTimeSeconds * 1000;
      const duplexReloadMs = (req.duplex && !printer.capabilities.duplexSupported) ? 90 * 1000 : 0;
      const totalDurationMs = printDurationMs + warmUpMs + duplexReloadMs;

      // 2. Find tentative start time
      let proposedStart = now;
      const activeSlots = printer.slots.filter(
        s => s.status === QueueStatus.PENDING || s.status === QueueStatus.PRINTING
      );

      if (activeSlots.length > 0) {
        const lastSlot = activeSlots[activeSlots.length - 1];
        proposedStart = Math.max(now, lastSlot.estimatedCompletionTime.getTime());
      }

      // 3. Shift forward for scheduled MaintenanceWindows
      let start = new Date(proposedStart);
      for (const window of printer.maintenanceWindows) {
        const end = new Date(start.getTime() + totalDurationMs);
        if (window.overlaps(start, end)) {
          start = new Date(window.endTime.getTime() + 1000); // 1s buffer
        }
      }

      const completionTime = start.getTime() + totalDurationMs;
      if (completionTime < earliestCompletionTime) {
        earliestCompletionTime = completionTime;
        bestPrinter = printer;
      }
    }

    return bestPrinter;
  }
}
