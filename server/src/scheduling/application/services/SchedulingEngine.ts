import { CapacityCalculator } from './CapacityCalculator';
import { InventoryService } from './InventoryService';
import { PrinterAssignmentService } from './PrinterAssignmentService';
import { ShopCapacityExceededError, InsufficientInventoryError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

/**
 * SchedulingEngine — orchestration service coordinating capacity checks, inventory rules, reservations, and assignments.
 *
 * RFC-008 Refinement 7 & 10 Specification
 */
export class SchedulingEngine {
  constructor(
    private readonly capacityCalculator: CapacityCalculator,
    private readonly inventoryService: InventoryService,
    private readonly assignmentService: PrinterAssignmentService
  ) {}

  /**
   * Schedules a print order within a transaction boundary.
   */
  public async scheduleOrder(
    shopId: number,
    orderId: number,
    pagesCount: number,
    duplex: boolean,
    color: boolean,
    paperSize: string,
    connection?: any
  ): Promise<void> {
    const useTransaction = !connection;
    const conn = useTransaction ? await db.getConnection() : connection;

    try {
      if (useTransaction) await conn.beginTransaction();

      // 1. Validate Capacity Gate
      const isOverloaded = await this.capacityCalculator.isShopOverloaded(shopId, conn);
      if (isOverloaded) {
        throw new ShopCapacityExceededError(shopId);
      }

      // 2. Validate Inventory Supply Subdomain
      const hasStock = await this.inventoryService.validateStock(shopId, paperSize, pagesCount, color, conn);
      if (!hasStock) {
        throw new InsufficientInventoryError(shopId, 'paper', paperSize, pagesCount, 0);
      }

      // 3. Reserve Inventory Stock
      await this.inventoryService.reserveInventory(shopId, paperSize, pagesCount, color, conn);

      // 4. Assign printer and schedule slot
      await this.assignmentService.assignOrder(shopId, orderId, pagesCount, duplex, color, paperSize, conn);

      if (useTransaction) await conn.commit();
    } catch (err: any) {
      if (useTransaction) await conn.rollback();
      console.error(`[SchedulingEngine.scheduleOrder] Scheduling failed for order ${orderId}:`, err.message);
      throw err;
    } finally {
      if (useTransaction) conn.release();
    }
  }
}
