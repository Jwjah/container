import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { Printer } from '../../domain/entities/Printer';
import { QueueSlot } from '../../domain/entities/QueueSlot';
import { MaintenanceWindow } from '../../domain/entities/MaintenanceWindow';
import { PrinterCapabilities } from '../../domain/value-objects/PrinterCapabilities';
import { PrinterStatus } from '../../domain/enums/PrinterStatus';
import { QueueStatus } from '../../domain/enums/QueueStatus';
import { SchedulingConcurrencyError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

export class SqlPrinterRepository implements IPrinterRepository {
  public async findById(id: number, connection?: any): Promise<Printer | null> {
    const executor = connection || db;
    const printerQuery = 'SELECT * FROM scheduling_printers WHERE id = ?';
    try {
      const [printerRows] = await executor.execute(printerQuery, [id]);
      const row = (printerRows as any[])[0];
      if (!row) return null;

      const slots = await this.loadSlotsForPrinter(id, executor);
      const maintenance = await this.loadMaintenanceForPrinter(id, executor);

      return this.mapToPrinter(row, slots, maintenance);
    } catch (err: any) {
      console.error('[SqlPrinterRepository.findById] Error:', err.message);
      throw err;
    }
  }

  public async findByShopId(shopId: number, connection?: any): Promise<Printer[]> {
    const executor = connection || db;
    const query = 'SELECT * FROM scheduling_printers WHERE shop_id = ? ORDER BY id ASC';
    try {
      const [rows] = await executor.execute(query, [shopId]);
      const printers: Printer[] = [];

      for (const row of rows as any[]) {
        const slots = await this.loadSlotsForPrinter(row.id, executor);
        const maintenance = await this.loadMaintenanceForPrinter(row.id, executor);
        printers.push(this.mapToPrinter(row, slots, maintenance));
      }

      return printers;
    } catch (err: any) {
      console.error('[SqlPrinterRepository.findByShopId] Error:', err.message);
      throw err;
    }
  }

  public async create(printer: Printer, connection?: any): Promise<number> {
    const executor = connection || db;
    const query = `
      INSERT INTO scheduling_printers (
        shop_id, name, status, pages_per_minute, duplex_supported, 
        color_supported, supported_paper_sizes, maximum_paper_weight, 
        printable_media, warmup_time_seconds, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const sizesStr = JSON.stringify(printer.capabilities.supportedPaperSizes);
      const mediaStr = JSON.stringify(printer.capabilities.printableMedia);

      const [result] = await executor.execute(query, [
        printer.shopId,
        printer.name,
        printer.status,
        printer.capabilities.pagesPerMinute,
        printer.capabilities.duplexSupported ? 1 : 0,
        printer.capabilities.colorSupported ? 1 : 0,
        sizesStr,
        printer.capabilities.maximumPaperWeight,
        mediaStr,
        printer.capabilities.warmupTimeSeconds,
        printer.version
      ]);

      const insertedId = (result as any).insertId;
      printer.id = insertedId;

      // Save slots and maintenance windows
      await this.saveSlots(insertedId, printer.slots, executor);
      await this.saveMaintenance(insertedId, printer.maintenanceWindows, executor);

      return insertedId;
    } catch (err: any) {
      console.error('[SqlPrinterRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(printer: Printer, connection?: any): Promise<void> {
    const executor = connection || db;
    const nextVersion = printer.version + 1;
    const query = `
      UPDATE scheduling_printers 
      SET name = ?, 
          status = ?, 
          pages_per_minute = ?, 
          duplex_supported = ?, 
          color_supported = ?, 
          supported_paper_sizes = ?, 
          maximum_paper_weight = ?, 
          printable_media = ?, 
          warmup_time_seconds = ?, 
          version = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND version = ?
    `;

    const useTransaction = !connection;
    const conn = useTransaction ? await db.getConnection() : executor;

    try {
      if (useTransaction) await conn.beginTransaction();

      const sizesStr = JSON.stringify(printer.capabilities.supportedPaperSizes);
      const mediaStr = JSON.stringify(printer.capabilities.printableMedia);

      const [result] = await conn.execute(query, [
        printer.name,
        printer.status,
        printer.capabilities.pagesPerMinute,
        printer.capabilities.duplexSupported ? 1 : 0,
        printer.capabilities.colorSupported ? 1 : 0,
        sizesStr,
        printer.capabilities.maximumPaperWeight,
        mediaStr,
        printer.capabilities.warmupTimeSeconds,
        nextVersion,
        printer.id,
        printer.version
      ]);

      const affected = (result as any).affectedRows ?? (result as any).changes ?? 0;
      if (affected === 0) {
        throw new SchedulingConcurrencyError('Printer', printer.id || 0);
      }

      // Synchronize slots
      await conn.execute('DELETE FROM scheduling_print_queue WHERE printer_id = ?', [printer.id]);
      await this.saveSlots(printer.id!, printer.slots, conn);

      // Synchronize maintenance windows
      await conn.execute('DELETE FROM scheduling_printer_maintenance WHERE printer_id = ?', [printer.id]);
      await this.saveMaintenance(printer.id!, printer.maintenanceWindows, conn);

      if (useTransaction) await conn.commit();
      printer.version = nextVersion;
    } catch (err: any) {
      if (useTransaction) await conn.rollback();
      if (err instanceof SchedulingConcurrencyError) throw err;
      console.error('[SqlPrinterRepository.update] Error:', err.message);
      throw err;
    } finally {
      if (useTransaction) conn.release();
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM scheduling_printer_maintenance');
      await executor.execute('DELETE FROM scheduling_print_queue');
      await executor.execute('DELETE FROM scheduling_printers');
    } catch (err: any) {
      console.error('[SqlPrinterRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private async loadSlotsForPrinter(printerId: number, executor: any): Promise<QueueSlot[]> {
    const query = 'SELECT * FROM scheduling_print_queue WHERE printer_id = ? ORDER BY queue_position ASC';
    const [rows] = await executor.execute(query, [printerId]);
    return (rows as any[]).map(row => {
      return new QueueSlot(
        row.id,
        row.shop_id,
        row.order_id,
        row.printer_id,
        row.queue_position,
        row.estimated_start_time instanceof Date ? row.estimated_start_time : new Date(row.estimated_start_time),
        row.estimated_completion_time instanceof Date ? row.estimated_completion_time : new Date(row.estimated_completion_time),
        row.pages_count,
        row.duplex === 1,
        row.color === 1,
        row.status as QueueStatus,
        row.version,
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at)
      );
    });
  }

  private async loadMaintenanceForPrinter(printerId: number, executor: any): Promise<MaintenanceWindow[]> {
    const query = 'SELECT * FROM scheduling_printer_maintenance WHERE printer_id = ? ORDER BY start_time ASC';
    const [rows] = await executor.execute(query, [printerId]);
    return (rows as any[]).map(row => {
      return new MaintenanceWindow(
        row.id,
        row.printer_id,
        row.start_time instanceof Date ? row.start_time : new Date(row.start_time),
        row.end_time instanceof Date ? row.end_time : new Date(row.end_time),
        row.reason,
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
      );
    });
  }

  private async saveSlots(printerId: number, slots: QueueSlot[], executor: any): Promise<void> {
    const query = `
      INSERT INTO scheduling_print_queue (
        shop_id, order_id, printer_id, queue_position, estimated_start_time, 
        estimated_completion_time, pages_count, duplex, color, status, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const slot of slots) {
      const startStr = slot.estimatedStartTime.toISOString();
      const endStr = slot.estimatedCompletionTime.toISOString();

      await executor.execute(query, [
        slot.shopId,
        slot.orderId,
        printerId,
        slot.queuePosition,
        startStr,
        endStr,
        slot.pagesCount,
        slot.duplex ? 1 : 0,
        slot.color ? 1 : 0,
        slot.status,
        slot.version
      ]);
    }
  }

  private async saveMaintenance(printerId: number, windows: MaintenanceWindow[], executor: any): Promise<void> {
    const query = `
      INSERT INTO scheduling_printer_maintenance (
        printer_id, start_time, end_time, reason
      ) VALUES (?, ?, ?, ?)
    `;

    for (const w of windows) {
      const startStr = w.startTime.toISOString();
      const endStr = w.endTime.toISOString();

      await executor.execute(query, [
        printerId,
        startStr,
        endStr,
        w.reason
      ]);
    }
  }

  private mapToPrinter(row: any, slots: QueueSlot[], maintenance: MaintenanceWindow[]): Printer {
    let sizesArr: string[] = [];
    let mediaArr: string[] = [];
    try {
      sizesArr = typeof row.supported_paper_sizes === 'string'
        ? JSON.parse(row.supported_paper_sizes)
        : row.supported_paper_sizes;
      mediaArr = typeof row.printable_media === 'string'
        ? JSON.parse(row.printable_media)
        : row.printable_media;
    } catch {
      sizesArr = ['A4'];
      mediaArr = ['plain'];
    }

    const caps = new PrinterCapabilities(
      row.pages_per_minute,
      row.duplex_supported === 1,
      row.color_supported === 1,
      sizesArr,
      row.maximum_paper_weight || 80,
      mediaArr,
      row.warmup_time_seconds || 30
    );

    const createdDate = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    const updatedDate = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);

    return new Printer(
      row.id,
      row.shop_id,
      row.name,
      row.status as PrinterStatus,
      caps,
      slots,
      maintenance,
      row.version,
      createdDate,
      updatedDate
    );
  }
}
