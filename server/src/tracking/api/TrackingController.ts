import { Request, Response } from 'express';
import { IOrderLifecycleProjectionRepository } from '../interfaces/IOrderLifecycleProjectionRepository';
import { ITimelineEventRepository } from '../interfaces/ITimelineEventRepository';
import { IProcessedEventsRepository } from '../interfaces/IProcessedEventsRepository';
import { TrackingMapper } from './TrackingMapper';
import { ProjectionWorker } from '../worker/ProjectionWorker';
import { ReplayService } from '../application/replay/ReplayService'; // We'll create this in 7F
import db from '../../config/database';

export class TrackingController {
  constructor(
    private readonly projRepo: IOrderLifecycleProjectionRepository,
    private readonly timelineRepo: ITimelineEventRepository,
    private readonly processedEventsRepo: IProcessedEventsRepository,
    private readonly worker?: ProjectionWorker,
    private readonly replayService?: ReplayService
  ) {}

  /**
   * GET /orders/:orderId/tracking
   * Exposes projection + last few timeline events for a customer.
   */
  public getOrderTracking = async (req: any, res: Response) => {
    try {
      const orderId = Number(req.params.orderId);
      const user = req.user;

      const projection = await this.projRepo.findByOrderId(orderId);
      if (!projection) {
        return res.status(404).json({ error: `Order tracking projection not found for order ID ${orderId}` });
      }

      // Authorization checks
      if (user.role === 'student' && projection.studentId !== user.id) {
        return res.status(403).json({ error: 'Access denied. You do not own this order.' });
      }

      if (user.role === 'shop' && projection.shopId !== user.id) {
        return res.status(403).json({ error: 'Access denied. This order does not belong to your shop.' });
      }

      if (user.role === 'agent' && projection.assignedAgentId !== user.id) {
        return res.status(403).json({ error: 'Access denied. You are not assigned to deliver this order.' });
      }

      const timeline = await this.timelineRepo.findByOrderId(orderId);
      const dto = TrackingMapper.toTrackingDTO(projection, timeline);
      return res.json(dto);
    } catch (err: any) {
      console.error('[TrackingController.getOrderTracking] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /orders/:orderId/timeline
   * Exposes complete immutable timeline of events.
   */
  public getOrderTimeline = async (req: any, res: Response) => {
    try {
      const orderId = Number(req.params.orderId);
      const user = req.user;

      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      const sort = String(req.query.sort || 'ASC').toUpperCase();

      const projection = await this.projRepo.findByOrderId(orderId);
      if (!projection) {
        return res.status(404).json({ error: `Order timeline projection not found for order ID ${orderId}` });
      }

      // Authorization checks
      if (user.role === 'student' && projection.studentId !== user.id) {
        return res.status(403).json({ error: 'Access denied. You do not own this order.' });
      }

      if (user.role === 'shop' && projection.shopId !== user.id) {
        return res.status(403).json({ error: 'Access denied. This order does not belong to your shop.' });
      }

      if (user.role === 'agent' && projection.assignedAgentId !== user.id) {
        return res.status(403).json({ error: 'Access denied. You are not assigned to deliver this order.' });
      }

      const timeline = await this.timelineRepo.findByOrderId(orderId);

      // Apply sorting
      if (sort === 'DESC') {
        timeline.reverse();
      }

      // Apply pagination in-memory (timeline arrays are small, usually < 10 events per order)
      const offset = (page - 1) * limit;
      const paginated = timeline.slice(offset, offset + limit);

      const dtoList = paginated.map(e => TrackingMapper.toTimelineEventDTO(e));
      return res.json({
        page,
        limit,
        total: timeline.length,
        data: dtoList
      });
    } catch (err: any) {
      console.error('[TrackingController.getOrderTimeline] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /shop/orders/:orderId/tracking
   * Exposes tracking specifically validated for shop access.
   */
  public getShopOrderTracking = async (req: any, res: Response) => {
    try {
      const orderId = Number(req.params.orderId);
      const user = req.user;

      if (user.role !== 'shop' && user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Shop credentials required.' });
      }

      const projection = await this.projRepo.findByOrderId(orderId);
      if (!projection) {
        return res.status(404).json({ error: `Order tracking projection not found for order ID ${orderId}` });
      }

      if (user.role === 'shop' && projection.shopId !== user.id) {
        return res.status(403).json({ error: 'Access denied. This order does not belong to your shop.' });
      }

      const timeline = await this.timelineRepo.findByOrderId(orderId);
      const dto = TrackingMapper.toTrackingDTO(projection, timeline);
      return res.json(dto);
    } catch (err: any) {
      console.error('[TrackingController.getShopOrderTracking] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /admin/orders/:orderId/tracking
   * Exposes tracking for admins (no owner checks).
   */
  public getAdminOrderTracking = async (req: any, res: Response) => {
    try {
      const orderId = Number(req.params.orderId);
      const user = req.user;

      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const projection = await this.projRepo.findByOrderId(orderId);
      if (!projection) {
        return res.status(404).json({ error: `Order tracking projection not found for order ID ${orderId}` });
      }

      const timeline = await this.timelineRepo.findByOrderId(orderId);
      const dto = TrackingMapper.toTrackingDTO(projection, timeline);
      return res.json(dto);
    } catch (err: any) {
      console.error('[TrackingController.getAdminOrderTracking] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /internal/projection/status
   * Diagnostics status exposing worker states and lag metrics.
   */
  public getProjectionStatus = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin credentials required.' });
      }

      const workerState = this.worker ? this.worker.getState() : 'STOPPED';
      const health = this.worker ? await this.worker.getHealth() : { queueLag: 0, lastProcessedEvent: null, lastProcessedAt: null };
      
      const processedCount = await this.processedEventsRepo.count();

      // Retrieve Dead Letter size
      const [dlqRows] = await db.execute('SELECT COUNT(*) AS cnt FROM dead_letter_events');
      const dlqSize = Number((dlqRows as any[])[0]?.cnt ?? 0);

      // Check if replay is active
      const replayActive = this.replayService ? this.replayService.isReplayActive() : false;

      return res.json({
        workerState,
        queueLag: health.queueLag,
        replayActive,
        dlqSize,
        processedEventsCount: processedCount,
        lastProcessedEventId: health.lastProcessedEvent,
        lastProcessedAt: health.lastProcessedAt
      });
    } catch (err: any) {
      console.error('[TrackingController.getProjectionStatus] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /health
   */
  public getHealth = async (req: Request, res: Response) => {
    return res.json({
      status: 'UP',
      timestamp: new Date().toISOString()
    });
  };

  /**
   * GET /health/live
   */
  public getHealthLive = async (req: Request, res: Response) => {
    return res.json({
      status: 'UP'
    });
  };

  /**
   * GET /health/ready
   * Readiness verifies database connection, worker status, lag, and replay state.
   */
  public getHealthReady = async (req: Request, res: Response) => {
    try {
      // 1. Verify Database
      await db.execute('SELECT 1');

      // 2. Check worker state
      const workerState = this.worker ? this.worker.getState() : 'STOPPED';

      // 3. Check queue lag
      const health = this.worker ? await this.worker.getHealth() : { queueLag: 0 };

      // 4. Check replay status
      const replayActive = this.replayService ? this.replayService.isReplayActive() : false;

      return res.json({
        status: 'READY',
        checks: {
          database: 'UP',
          worker: workerState,
          queueLag: health.queueLag,
          replayActive
        }
      });
    } catch (err: any) {
      console.error('[TrackingController.getHealthReady] Readiness failure:', err.message);
      return res.status(503).json({
        status: 'DOWN',
        error: err.message || 'Database connection failure or service ready check failed'
      });
    }
  };
}
