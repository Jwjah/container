import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { QueueStatus } from '../../domain/enums/QueueStatus';
import { PrinterStatus } from '../../domain/enums/PrinterStatus';
import { PrinterAssignmentService } from './PrinterAssignmentService';
import { ResourceNotFoundError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

/**
 * QueueService — manages queue slot status transitions, compactions, and offline printer re-routings.
 *
 * RFC-008 Part 6 Specification
 */
export class QueueService {
  public static printerFailoversCount = 0;

  constructor(
    private readonly printerRepo: IPrinterRepository,
    private readonly assignmentService: PrinterAssignmentService
  ) {}

  /**
   * Removes a slot on order cancellation, triggering queue compaction and ETA recalculations.
   */
  public async cancelOrder(orderId: number, connection?: any): Promise<void> {
    const executor = connection || db;

    // Locate the slot in the db to find its printer
    const query = 'SELECT printer_id FROM scheduling_print_queue WHERE order_id = ?';
    const [rows] = await executor.execute(query, [orderId]);
    const row = (rows as any[])[0];
    if (!row || !row.printer_id) return;

    const printer = await this.printerRepo.findById(row.printer_id, executor);
    if (!printer) return;

    printer.removeQueueSlot(orderId);
    await this.printerRepo.update(printer, executor);
  }

  /**
   * Sets slot status to PRINTING.
   */
  public async startOrder(orderId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    await this.updateSlotStatus(orderId, QueueStatus.PRINTING, executor);
  }

  /**
   * Sets slot status to COMPLETED and recalculates remaining ETAs.
   */
  public async completeOrder(orderId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    await this.updateSlotStatus(orderId, QueueStatus.COMPLETED, executor);
  }

  /**
   * Sets slot status to CANCELLED.
   */
  public async failOrder(orderId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    await this.updateSlotStatus(orderId, QueueStatus.CANCELLED, executor);
  }

  /**
   * Reschedules all pending print queue slots of a printer that goes offline to other online shop printers.
   */
  public async rescheduleOfflinePrinter(printerId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const printer = await this.printerRepo.findById(printerId, executor);
    if (!printer) {
      throw new ResourceNotFoundError('Printer', printerId);
    }

    // Set status to OFFLINE
    printer.updateStatus(PrinterStatus.OFFLINE);

    const pendingSlots = printer.slots.filter(s => s.status === QueueStatus.PENDING);
    
    const useTransaction = !connection;
    const conn = useTransaction ? await db.getConnection() : executor;

    try {
      if (useTransaction) await conn.beginTransaction();

      // Update offline printer state
      await this.printerRepo.update(printer, conn);

      // Reschedule each pending slot to other printers in the same shop
      for (const slot of pendingSlots) {
        await this.assignmentService.assignOrder(
          printer.shopId,
          slot.orderId,
          slot.pagesCount,
          slot.duplex,
          slot.color,
          'A4', // default size
          conn
        );
      }

      if (useTransaction) await conn.commit();
      QueueService.printerFailoversCount++;
    } catch (err: any) {
      if (useTransaction) await conn.rollback();
      console.error(`[QueueService.rescheduleOfflinePrinter] Reschedule failed for printer ${printerId}:`, err.message);
      throw err;
    } finally {
      if (useTransaction) conn.release();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private async updateSlotStatus(orderId: number, status: QueueStatus, executor: any): Promise<void> {
    const query = 'SELECT printer_id FROM scheduling_print_queue WHERE order_id = ?';
    const [rows] = await executor.execute(query, [orderId]);
    const row = (rows as any[])[0];
    if (!row || !row.printer_id) return;

    const printer = await this.printerRepo.findById(row.printer_id, executor);
    if (!printer) return;

    const slot = printer.slots.find(s => s.orderId === orderId);
    if (slot) {
      slot.updateStatus(status);
      printer.sortAndShiftSlots();
      await this.printerRepo.update(printer, executor);
    }
  }
}
