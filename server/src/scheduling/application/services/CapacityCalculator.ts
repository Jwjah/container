import { IShopCapacityRepository } from '../../interfaces/IShopCapacityRepository';
import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import db from '../../../config/database';

/**
 * CapacityCalculator — evaluates shop workload limits and overload protection gates.
 *
 * RFC-008 Refinement 3 Specification (Workloads are derived dynamically from queue states)
 */
export class CapacityCalculator {
  constructor(
    private readonly capacityRepo: IShopCapacityRepository,
    private readonly printerRepo: IPrinterRepository
  ) {}

  /**
   * Evaluates if a shop has exceeded its running parallel order bounds.
   */
  public async isShopOverloaded(shopId: number, connection?: any): Promise<boolean> {
    const executor = connection || db;
    
    // 1. Get capacity rules
    const cap = await this.capacityRepo.findById(shopId, executor);
    if (!cap) return false;

    // 2. Count active jobs in the queue
    const query = `
      SELECT COUNT(*) AS cnt 
      FROM scheduling_print_queue 
      WHERE shop_id = ? AND status IN ('pending', 'printing')
    `;
    const [rows] = await executor.execute(query, [shopId]);
    const activeCount = Number((rows as any[])[0]?.cnt ?? 0);

    if (activeCount >= cap.maxParallelOrders) {
      return true;
    }

    // 3. Evaluate total queue delay of all printers in the shop
    const printers = await this.printerRepo.findByShopId(shopId, executor);
    let maxWaitTimeMs = 0;
    const now = Date.now();

    for (const printer of printers) {
      const pending = printer.slots.filter(s => s.status === 'pending' || s.status === 'printing');
      if (pending.length > 0) {
        const lastSlot = pending[pending.length - 1];
        const waitTime = lastSlot.estimatedCompletionTime.getTime() - now;
        if (waitTime > maxWaitTimeMs) {
          maxWaitTimeMs = waitTime;
        }
      }
    }

    const maxWaitTimeSeconds = maxWaitTimeMs / 1000;
    if (maxWaitTimeSeconds >= cap.overloadWaitThresholdSeconds) {
      return true;
    }

    return false;
  }
}
