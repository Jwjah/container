import { Request, Response } from 'express';
import { IShopCapacityRepository } from '../interfaces/IShopCapacityRepository';
import { IPrinterRepository } from '../interfaces/IPrinterRepository';
import { InventoryService } from '../application/services/InventoryService';
import { EtaCalculationService } from '../application/services/EtaCalculationService';
import { CapacityForecastService } from '../application/services/CapacityForecastService';
import { SchedulingReplayService } from '../application/replay/SchedulingReplayService';
import { ReplayProgressTracker } from '../application/replay/ReplayProgressTracker';
import { SchedulingMapper } from './SchedulingMapper';
import { SchedulingMetricsService } from '../application/metrics/SchedulingMetricsService';
import db from '../../config/database';

/**
 * SchedulingController — exposes REST routes with validation and role checks.
 *
 * RFC-008 Part 8 Specification
 */
export class SchedulingController {
  constructor(
    private readonly capacityRepo: IShopCapacityRepository,
    private readonly printerRepo: IPrinterRepository,
    private readonly inventoryService: InventoryService,
    private readonly etaService: EtaCalculationService,
    private readonly forecastService: CapacityForecastService,
    private readonly replayService: SchedulingReplayService,
    private readonly progressTracker: ReplayProgressTracker,
    private readonly metricsService: SchedulingMetricsService
  ) {}

  public getShopCapacity = async (req: Request, res: Response): Promise<void> => {
    const shopId = Number(req.params.shopId);
    try {
      const capacity = await this.capacityRepo.findById(shopId);
      if (!capacity) {
        res.status(404).json({ error: `Shop capacity configuration not found for shop ID ${shopId}` });
        return;
      }

      // Allow students (for order previews), shop owners, and admins
      const isAuthorized = await this.checkShopAccess(req, shopId, true);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Access denied to shop capacity data.' });
        return;
      }

      // Fetch dynamic active queue count
      const [slotRows] = await db.execute(
        "SELECT COUNT(*) AS activeCount FROM scheduling_print_queue WHERE shop_id = ? AND status IN ('pending', 'printing')",
        [shopId]
      );
      const activeCount = Number((slotRows as any[])[0]?.activeCount ?? 0);

      const dto = SchedulingMapper.toShopCapacityDTO(capacity);
      res.status(200).json({
        ...dto,
        currentActiveOrders: activeCount
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getShopPrinters = async (req: Request, res: Response): Promise<void> => {
    const shopId = Number(req.params.shopId);
    try {
      const isAuthorized = await this.checkShopAccess(req, shopId, false);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Access denied to shop printers list.' });
        return;
      }

      const printers = await this.printerRepo.findByShopId(shopId);
      res.status(200).json(printers.map(p => SchedulingMapper.toPrinterDTO(p)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getShopQueue = async (req: Request, res: Response): Promise<void> => {
    const shopId = Number(req.params.shopId);
    try {
      const isAuthorized = await this.checkShopAccess(req, shopId, false);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Access denied to shop queue details.' });
        return;
      }

      // Load all queue slots for this shop
      const [rows] = await db.execute(
        'SELECT * FROM scheduling_print_queue WHERE shop_id = ? ORDER BY queue_position ASC',
        [shopId]
      );

      const slots = (rows as any[]).map(row => {
        const start = row.estimated_start_time instanceof Date ? row.estimated_start_time : new Date(row.estimated_start_time);
        const end = row.estimated_completion_time instanceof Date ? row.estimated_completion_time : new Date(row.estimated_completion_time);
        return {
          id: row.id,
          shopId: row.shop_id,
          orderId: row.order_id,
          printerId: row.printer_id,
          queuePosition: row.queue_position,
          estimatedStartTime: start.toISOString(),
          estimatedCompletionTime: end.toISOString(),
          pagesCount: row.pages_count,
          duplex: row.duplex === 1,
          color: row.color === 1,
          status: row.status
        };
      });

      res.status(200).json(slots);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getOrderEta = async (req: Request, res: Response): Promise<void> => {
    const orderId = Number(req.params.orderId);
    try {
      // 1. Fetch order details to check ownership
      const [orderRows] = await db.execute('SELECT user_id, shop_id FROM orders WHERE id = ?', [orderId]);
      const orderRow = (orderRows as any[])[0];
      if (!orderRow) {
        res.status(404).json({ error: `Order ID ${orderId} not found` });
        return;
      }

      // Auth validation
      const isOwner = (req as any).user?.id === orderRow.user_id;
      const isShopOwner = await this.checkShopAccess(req, orderRow.shop_id, false);
      const isAdmin = (req as any).user?.role === 'admin';

      if (!isOwner && !isShopOwner && !isAdmin) {
        res.status(403).json({ error: 'Access denied to order ETA details.' });
        return;
      }

      const eta = await this.etaService.getOrderEta(orderId);
      res.status(200).json(SchedulingMapper.toOrderEtaDTO({
        orderId,
        ...eta
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getCapacityForecast = async (req: Request, res: Response): Promise<void> => {
    const shopId = Number(req.params.shopId);
    try {
      const isAuthorized = await this.checkShopAccess(req, shopId, true);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Access denied to capacity forecast.' });
        return;
      }

      const forecast = await this.forecastService.getForecast(shopId);
      res.status(200).json(forecast);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public replenishInventory = async (req: Request, res: Response): Promise<void> => {
    const shopId = Number(req.params.shopId);
    const { type, variant, quantity } = req.body;
    try {
      const isAuthorized = await this.checkShopAccess(req, shopId, false);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Access denied to shop inventory controls.' });
        return;
      }

      await this.inventoryService.replenishInventory(shopId, type, variant, quantity);
      res.status(200).json({ message: 'Inventory replenished successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public triggerReplay = async (req: Request, res: Response): Promise<void> => {
    try {
      if ((req as any).user?.role !== 'admin') {
        res.status(403).json({ error: 'Admin credentials required to trigger system replay.' });
        return;
      }

      const reset = req.body.reset !== false;
      // Trigger replay in background
      this.replayService.triggerReplay({ reset });
      res.status(202).json({ message: 'Replay rebuild triggered successfully. Progress tracking running.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getReplayStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      if ((req as any).user?.role !== 'admin') {
        res.status(403).json({ error: 'Admin credentials required to check replay status.' });
        return;
      }

      const progress = this.progressTracker.getProgress();
      res.status(200).json(progress);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  public getMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.metricsService.getMetricsString();
      res.set('Content-Type', 'text/plain');
      res.status(200).send(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Helper Authorization check
  // ────────────────────────────────────────────────────────────────────────────

  private async checkShopAccess(req: Request, shopId: number, allowStudent: boolean): Promise<boolean> {
    const user = (req as any).user;
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (allowStudent && user.role === 'student') return true;

    if (user.role === 'shop') {
      // Find shop owned by this user
      const [rows] = await db.execute('SELECT id FROM shops WHERE id = ? AND user_id = ?', [
        shopId,
        user.id
      ]);
      return (rows as any[]).length > 0;
    }

    return false;
  }
}
