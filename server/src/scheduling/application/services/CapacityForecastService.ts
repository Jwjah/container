import { IShopCapacityRepository } from '../../interfaces/IShopCapacityRepository';
import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { IInventoryRepository } from '../../interfaces/IInventoryRepository';
import { CapacityForecastDTO } from '../../api/SchedulingDTO';

/**
 * CapacityForecastService — calculates advisory performance trends, stock depletion, and load levels.
 *
 * RFC-008 Refinement 2 Specification
 */
export class CapacityForecastService {
  constructor(
    private readonly capacityRepo: IShopCapacityRepository,
    private readonly printerRepo: IPrinterRepository,
    private readonly inventoryRepo: IInventoryRepository
  ) {}

  /**
   * Generates advisory capacity forecasting analytics for a target shop.
   */
  public async getForecast(shopId: number, connection?: any): Promise<CapacityForecastDTO> {
    const cap = await this.capacityRepo.findById(shopId, connection);
    const printers = await this.printerRepo.findByShopId(shopId, connection);
    const inventory = await this.inventoryRepo.findByShopId(shopId, connection);

    if (!cap) {
      throw new Error(`Shop capacity details not found for ID ${shopId}`);
    }

    const now = Date.now();
    let totalQueueWaitMs = 0;
    let totalPrintTimeMs = 0;

    for (const printer of printers) {
      const active = printer.slots.filter(s => s.status === 'pending' || s.status === 'printing');
      if (active.length > 0) {
        const lastSlot = active[active.length - 1];
        totalQueueWaitMs += Math.max(0, lastSlot.estimatedCompletionTime.getTime() - now);
        
        // Sum print time of active slots
        for (const slot of active) {
          totalPrintTimeMs += (slot.pagesCount / printer.capabilities.pagesPerMinute) * 60 * 1000;
        }
      }
    }

    // 1. Printer Utilization
    const activePrintersCount = printers.filter(p => p.status === 'available').length;
    const printerCapacityHourMs = Math.max(1, activePrintersCount) * 60 * 60 * 1000; // 1 hour capacity in ms
    const printerUtilizationPercent = Math.min(100, Math.floor((totalPrintTimeMs / printerCapacityHourMs) * 100));

    // 2. Expected Overload Time
    const currentQueueWaitSeconds = totalQueueWaitMs / 1000;
    const expectedOverloadTimeSeconds = Math.max(0, cap.overloadWaitThresholdSeconds - currentQueueWaitSeconds);

    // 3. Stock levels forecasting (days remaining assuming average consumption of 200 pages per day)
    const dailyPageUsage = 200;
    const paperItem = inventory.find(i => i.type === 'paper');
    const paperDaysRemaining = paperItem
      ? Math.max(0, Math.floor(paperItem.quantity / dailyPageUsage))
      : 0;

    const inkItem = inventory.find(i => i.type === 'ink' && i.variant === 'Black');
    // Assumes 0.05% ink per page = 10% ink per day at 200 pages
    const dailyInkUsagePercent = dailyPageUsage * 0.05; 
    const inkDaysRemaining = inkItem
      ? Math.max(0, Math.floor(inkItem.quantity / dailyInkUsagePercent))
      : 0;

    return {
      shopId,
      printerUtilizationPercent,
      expectedOverloadTimeSeconds,
      paperDaysRemaining,
      inkDaysRemaining,
      forecastTimestamp: new Date().toISOString()
    };
  }
}
