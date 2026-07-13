import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { MaintenanceWindow } from '../../domain/entities/MaintenanceWindow';
import { PrinterStatus } from '../../domain/enums/PrinterStatus';
import { ResourceNotFoundError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

/**
 * MaintenancePlanner — schedules downtime blocks and triggers queue updates.
 *
 * RFC-008 Refinement 8 Specification
 */
export class MaintenancePlanner {
  constructor(private readonly printerRepo: IPrinterRepository) {}

  /**
   * Schedules a maintenance window on a printer and shifts queued slots dynamically.
   */
  public async scheduleMaintenance(
    printerId: number,
    startTime: Date,
    endTime: Date,
    reason: string,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;
    const printer = await this.printerRepo.findById(printerId, executor);
    if (!printer) {
      throw new ResourceNotFoundError('Printer', printerId);
    }

    const window = new MaintenanceWindow(null, printerId, startTime, endTime, reason);
    printer.addMaintenanceWindow(window);
    
    // Set status to MAINTENANCE if it starts now
    if (startTime <= new Date() && endTime >= new Date()) {
      printer.updateStatus(PrinterStatus.MAINTENANCE);
    }

    await this.printerRepo.update(printer, executor);
  }

  /**
   * Completes active maintenance windows, restoring printer to AVAILABLE.
   */
  public async completeMaintenance(printerId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const printer = await this.printerRepo.findById(printerId, executor);
    if (!printer) {
      throw new ResourceNotFoundError('Printer', printerId);
    }

    printer.updateStatus(PrinterStatus.AVAILABLE);
    await this.printerRepo.update(printer, executor);
  }
}
