import { IShopCapacityRepository } from '../../interfaces/IShopCapacityRepository';
import { IPrinterRepository } from '../../interfaces/IPrinterRepository';
import { IInventoryRepository } from '../../interfaces/IInventoryRepository';
import { ISchedulingSnapshotRepository } from '../../interfaces/ISchedulingSnapshotRepository';
import { SchedulingSnapshot } from '../../domain/entities/SchedulingSnapshot';
import { ShopCapacity } from '../../domain/entities/ShopCapacity';
import { Printer } from '../../domain/entities/Printer';
import { InventoryItem } from '../../domain/entities/InventoryItem';
import { PrinterCapabilities } from '../../domain/value-objects/PrinterCapabilities';
import { PrinterStatus } from '../../domain/enums/PrinterStatus';
import { QueueSlot } from '../../domain/entities/QueueSlot';
import { MaintenanceWindow } from '../../domain/entities/MaintenanceWindow';
import { QueueStatus } from '../../domain/enums/QueueStatus';
import db from '../../../config/database';

/**
 * SchedulingSnapshotService — handles snapshot generation and restoration processes.
 *
 * RFC-008 Refinement 1 Specification
 */
export class SchedulingSnapshotService {
  constructor(
    private readonly capacityRepo: IShopCapacityRepository,
    private readonly printerRepo: IPrinterRepository,
    private readonly inventoryRepo: IInventoryRepository,
    private readonly snapshotRepo: ISchedulingSnapshotRepository
  ) {}

  /**
   * Serializes current shop capacities, printer states, and stock levels to a new snapshot entry.
   */
  public async createSnapshot(
    shopId: number,
    lastEventId: string,
    lastEventSequence: number,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;

    const capacity = await this.capacityRepo.findById(shopId, executor);
    const printers = await this.printerRepo.findByShopId(shopId, executor);
    const inventory = await this.inventoryRepo.findByShopId(shopId, executor);

    if (!capacity) {
      throw new Error(`Cannot snapshot: shop capacity config for shop ${shopId} not found`);
    }

    const state = {
      capacity: {
        shopId: capacity.shopId,
        maxParallelOrders: capacity.maxParallelOrders,
        overloadWaitThresholdSeconds: capacity.overloadWaitThresholdSeconds,
        isAcceptingOrders: capacity.isAcceptingOrders,
        version: capacity.version
      },
      printers: printers.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        version: p.version,
        capabilities: {
          pagesPerMinute: p.capabilities.pagesPerMinute,
          duplexSupported: p.capabilities.duplexSupported,
          colorSupported: p.capabilities.colorSupported,
          supportedPaperSizes: p.capabilities.supportedPaperSizes,
          maximumPaperWeight: p.capabilities.maximumPaperWeight,
          printableMedia: p.capabilities.printableMedia,
          warmupTimeSeconds: p.capabilities.warmupTimeSeconds
        },
        slots: p.slots.map(s => ({
          id: s.id,
          orderId: s.orderId,
          queuePosition: s.queuePosition,
          estimatedStartTime: s.estimatedStartTime.toISOString(),
          estimatedCompletionTime: s.estimatedCompletionTime.toISOString(),
          pagesCount: s.pagesCount,
          duplex: s.duplex,
          color: s.color,
          status: s.status,
          version: s.version
        })),
        maintenance: p.maintenanceWindows.map(m => ({
          id: m.id,
          startTime: m.startTime.toISOString(),
          endTime: m.endTime.toISOString(),
          reason: m.reason
        }))
      })),
      inventory: inventory.map(item => ({
        id: item.id,
        type: item.type,
        variant: item.variant,
        quantity: item.quantity,
        unit: item.unit,
        lowStockThreshold: item.lowStockThreshold,
        version: item.version
      }))
    };

    const snapshot = new SchedulingSnapshot(
      shopId,
      lastEventId,
      lastEventSequence,
      JSON.stringify(state)
    );

    await this.snapshotRepo.save(snapshot, executor);
    console.log(`📸 [SnapshotService] Created snapshot for shop ${shopId} at event sequence ${lastEventSequence}`);
  }

  /**
   * Restores shop data from the latest snapshot checkpoint and fast-forwards processed markers.
   */
  public async restoreSnapshot(shopId: number, connection?: any): Promise<SchedulingSnapshot | null> {
    const useTransaction = !connection;
    const conn = useTransaction ? await db.getConnection() : connection;

    try {
      if (useTransaction) await conn.beginTransaction();

      const snapshot = await this.snapshotRepo.findLatestByShopId(shopId, conn);
      if (!snapshot) {
        if (useTransaction) await conn.rollback();
        return null;
      }

      const state = JSON.parse(snapshot.stateData);

      // 1. Wipe current shop data
      await conn.execute('DELETE FROM scheduling_shops_capacity WHERE shop_id = ?', [shopId]);
      await conn.execute('DELETE FROM scheduling_printers WHERE shop_id = ?', [shopId]);
      await conn.execute('DELETE FROM scheduling_inventory WHERE shop_id = ?', [shopId]);

      // 2. Restore Capacity
      const capData = state.capacity;
      const capacity = new ShopCapacity(
        capData.shopId,
        capData.maxParallelOrders,
        capData.overloadWaitThresholdSeconds,
        capData.isAcceptingOrders,
        capData.version
      );
      await this.capacityRepo.create(capacity, conn);

      // 3. Restore Inventory
      for (const itemData of state.inventory) {
        const item = new InventoryItem(
          itemData.id,
          shopId,
          itemData.type,
          itemData.variant,
          itemData.quantity,
          itemData.unit,
          itemData.lowStockThreshold,
          itemData.version
        );
        await this.inventoryRepo.create(item, conn);
      }

      // 4. Restore Printers with slots and maintenance windows
      for (const pData of state.printers) {
        const caps = new PrinterCapabilities(
          pData.capabilities.pagesPerMinute,
          pData.capabilities.duplexSupported,
          pData.capabilities.colorSupported,
          pData.capabilities.supportedPaperSizes,
          pData.capabilities.maximumPaperWeight,
          pData.capabilities.printableMedia,
          pData.capabilities.warmupTimeSeconds
        );

        const slots = pData.slots.map((s: any) => new QueueSlot(
          s.id,
          shopId,
          s.orderId,
          pData.id,
          s.queuePosition,
          new Date(s.estimatedStartTime),
          new Date(s.estimatedCompletionTime),
          s.pagesCount,
          s.duplex,
          s.color,
          s.status as QueueStatus,
          s.version
        ));

        const maintenance = pData.maintenance.map((m: any) => new MaintenanceWindow(
          m.id,
          pData.id,
          new Date(m.startTime),
          new Date(m.endTime),
          m.reason
        ));

        const printer = new Printer(
          pData.id,
          shopId,
          pData.name,
          pData.status as PrinterStatus,
          caps,
          slots,
          maintenance,
          pData.version
        );

        await this.printerRepo.create(printer, conn);
      }

      // 5. Fast-forward processed events markers up to this sequence number!
      await conn.execute(
        'INSERT OR IGNORE INTO scheduling_processed_events (event_id) SELECT event_id FROM outbox_events WHERE id <= ?',
        [snapshot.lastEventSequence]
      );

      if (useTransaction) await conn.commit();
      console.log(`📸 [SnapshotService] Restored shop ${shopId} state from snapshot (event sequence: ${snapshot.lastEventSequence})`);
      return snapshot;
    } catch (err: any) {
      if (useTransaction) await conn.rollback();
      console.error('[SnapshotService.restoreSnapshot] Error restoring snapshot:', err.message);
      throw err;
    } finally {
      if (useTransaction) conn.release();
    }
  }
}
