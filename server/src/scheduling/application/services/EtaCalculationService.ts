import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { ISchedulingStrategy } from '../strategies/ISchedulingStrategy';
import { ResourceNotFoundError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

/**
 * EtaCalculationService — provides deterministic queue ETAs and position previews.
 *
 * RFC-008 Refinement 6 Specification
 */
export class EtaCalculationService {
  constructor(
    private readonly printerRepo: IPrinterRepository,
    private readonly strategy: ISchedulingStrategy
  ) {}

  /**
   * Retrieves active scheduled ETA for an existing placed order.
   */
  public async getOrderEta(
    orderId: number,
    connection?: any
  ): Promise<{ queuePosition: number; printerId: number | null; startTime: Date; completionTime: Date }> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_print_queue WHERE order_id = ?';
    const [rows] = await executor.execute(query, [orderId]);
    const row = (rows as any[])[0];

    if (!row) {
      throw new ResourceNotFoundError('QueueSlot', orderId);
    }

    const start = row.estimated_start_time instanceof Date ? row.estimated_start_time : new Date(row.estimated_start_time);
    const end = row.estimated_completion_time instanceof Date ? row.estimated_completion_time : new Date(row.estimated_completion_time);

    return {
      queuePosition: row.queue_position,
      printerId: row.printer_id,
      startTime: start,
      completionTime: end
    };
  }

  /**
   * Previews the potential ETA and queue position for a prospective order.
   */
  public async calculatePotentialEta(
    shopId: number,
    pagesCount: number,
    duplex: boolean,
    color: boolean,
    paperSize: string,
    connection?: any
  ): Promise<{ queuePosition: number; printerId: number | null; startTime: Date; completionTime: Date }> {
    const executor = connection || db;
    const printers = await this.printerRepo.findByShopId(shopId, executor);
    
    if (printers.length === 0) {
      throw new Error(`No printers registered for shop ID ${shopId}`);
    }

    const req = { pagesCount, duplex, color, paperSize };
    const optimal = this.strategy.assignPrinter(printers, req);

    if (!optimal) {
      throw new Error('No compatible printers available in shop to preview ETA');
    }

    // Determine position if appended
    const activeSlots = optimal.slots.filter(s => s.status === 'pending' || s.status === 'printing');
    const queuePosition = activeSlots.length + 1;

    // Calculate times
    const printDurationMs = Math.ceil((pagesCount / optimal.capabilities.pagesPerMinute) * 60 * 1000);
    const warmUpMs = optimal.capabilities.warmupTimeSeconds * 1000;
    const duplexReloadMs = (duplex && !optimal.capabilities.duplexSupported) ? 90 * 1000 : 0;
    const totalDurationMs = printDurationMs + warmUpMs + duplexReloadMs;

    let proposedStart = Date.now();
    if (activeSlots.length > 0) {
      proposedStart = Math.max(Date.now(), activeSlots[activeSlots.length - 1].estimatedCompletionTime.getTime());
    }

    let start = new Date(proposedStart);
    for (const w of optimal.maintenanceWindows) {
      const end = new Date(start.getTime() + totalDurationMs);
      if (w.overlaps(start, end)) {
        start = new Date(w.endTime.getTime() + 1000);
      }
    }

    const end = new Date(start.getTime() + totalDurationMs);

    return {
      queuePosition,
      printerId: optimal.id,
      startTime: start,
      completionTime: end
    };
  }
}
