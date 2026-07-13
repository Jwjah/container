import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { ISchedulingStrategy } from '../strategies/ISchedulingStrategy';
import { Printer } from '../../domain/entities/Printer';
import { QueueSlot } from '../../domain/entities/QueueSlot';
import { QueueStatus } from '../../domain/enums/QueueStatus';
import { ResourceNotFoundError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

/**
 * PrinterAssignmentService — selects optimal printer and updates Printer Aggregate queues.
 *
 * RFC-008 Refinement 7 & 10 Specification
 */
export class PrinterAssignmentService {
  constructor(
    private readonly printerRepo: IPrinterRepository,
    private readonly strategy: ISchedulingStrategy
  ) {}

  /**
   * Assigns an incoming order to the best printer in the shop and commits the update.
   */
  public async assignOrder(
    shopId: number,
    orderId: number,
    pagesCount: number,
    duplex: boolean,
    color: boolean,
    paperSize: string,
    connection?: any
  ): Promise<Printer> {
    const executor = connection || db;

    // 1. Get all printers for the shop
    const printers = await this.printerRepo.findByShopId(shopId, executor);
    if (printers.length === 0) {
      throw new Error(`No printers registered for shop ID ${shopId}`);
    }

    // 2. Select optimal printer using strategy
    const requirements = { pagesCount, duplex, color, paperSize };
    const optimalPrinter = this.strategy.assignPrinter(printers, requirements);
    if (!optimalPrinter) {
      throw new Error(`No compatible or online printer found for order ID ${orderId}`);
    }

    // 3. Create and append queue slot inside aggregate root
    const slot = new QueueSlot(
      null,
      shopId,
      orderId,
      optimalPrinter.id,
      0, // position assigned inside aggregate
      new Date(),
      new Date(),
      pagesCount,
      duplex,
      color,
      QueueStatus.PENDING
    );
    optimalPrinter.addQueueSlot(slot);

    // 4. Persist updated aggregate state
    await this.printerRepo.update(optimalPrinter, executor);

    return optimalPrinter;
  }
}
