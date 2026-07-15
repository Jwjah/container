import { Request, Response } from 'express';
import { ShopAnalyticsService } from '../application/services/ShopAnalyticsService';
import { UserAnalyticsService } from '../application/services/UserAnalyticsService';
import { RevenueService } from '../application/services/RevenueService';
import { ReportingService } from '../application/services/ReportingService';
import { AnalyticsMetricsService } from '../application/metrics/AnalyticsMetricsService';
import { AnalyticsReplayService } from '../application/replay/AnalyticsReplayService';
import { AnalyticsReplayProgressTracker } from '../application/replay/AnalyticsReplayProgressTracker';
import { AnalyticsMapper } from './AnalyticsMapper';
import db from '../../config/database';

/**
 * AnalyticsController — exposes all RFC-010 REST endpoints with role-based authorization.
 * RFC-010 Specification
 */
export class AnalyticsController {
  constructor(
    private readonly shopAnalyticsService: ShopAnalyticsService,
    private readonly userAnalyticsService: UserAnalyticsService,
    private readonly revenueService: RevenueService,
    private readonly reportingService: ReportingService,
    private readonly metricsService: AnalyticsMetricsService,
    private readonly replayService: AnalyticsReplayService,
    private readonly progressTracker: AnalyticsReplayProgressTracker
  ) {}

  // ─── Student: GET /api/analytics/me ───────────────────────────────────────
  public getMyAnalytics = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const { analytics, recentOrders } = await this.userAnalyticsService.getUserActivity(user.id);
      if (!analytics) {
        res.status(200).json({ userId: user.id, totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalSpend: 0, avgOrderValue: 0, lastOrderAt: null, recentOrders: [] });
        return;
      }
      res.status(200).json(AnalyticsMapper.toUserDTO(analytics, recentOrders));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Shop: GET /api/analytics/shop ────────────────────────────────────────
  public getShopAnalytics = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const shopId = await this.resolveShopId(user);
      if (!shopId) { res.status(403).json({ error: 'No shop associated with this account' }); return; }

      const analytics = await this.shopAnalyticsService.getShopAnalytics(shopId);
      if (!analytics) {
        res.status(200).json({ shopId, totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalRevenue: 0, successRate: 0, avgCompletionTimeSecs: 0, avgDeliveryTimeSecs: 0, printerUtilizationPct: 0, queueUtilizationPct: 0, lowStockEvents: 0 });
        return;
      }
      res.status(200).json(AnalyticsMapper.toShopDTO(analytics));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Shop: GET /api/analytics/shop/daily ─────────────────────────────────
  public getShopDailyAnalytics = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const shopId = await this.resolveShopId(user);
      if (!shopId) { res.status(403).json({ error: 'No shop associated with this account' }); return; }

      const days = Number(req.query.days ?? 30);
      const breakdown = await this.shopAnalyticsService.getShopDailyBreakdown(shopId, days);
      res.status(200).json({ shopId, days, breakdown });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Shop: GET /api/analytics/shop/performance ────────────────────────────
  public getShopPerformance = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const shopId = await this.resolveShopId(user);
      if (!shopId) { res.status(403).json({ error: 'No shop associated with this account' }); return; }

      const performance = await this.shopAnalyticsService.getShopPerformance(shopId);
      res.status(200).json({ shopId, ...performance });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Admin: GET /api/admin/analytics/platform ─────────────────────────────
  public getPlatformReport = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }

    try {
      const days = Number(req.query.days ?? 30);
      const report = await this.reportingService.getPlatformReport(days);
      res.status(200).json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Admin: GET /api/admin/analytics/revenue ──────────────────────────────
  public getRevenueReport = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }

    try {
      const days = Number(req.query.days ?? 30);
      const [summary, trend] = await Promise.all([
        this.revenueService.getRevenueSummary(),
        this.revenueService.getDailyRevenueTrend(days)
      ]);
      res.status(200).json({ summary, dailyTrend: trend });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Admin: GET /api/admin/analytics/orders ───────────────────────────────
  public getOrdersReport = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }

    try {
      const days = Number(req.query.days ?? 30);
      const report = await this.reportingService.getOrdersReport(days);
      res.status(200).json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Admin: GET /api/admin/analytics/shops ────────────────────────────────
  public getShopsRanking = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }

    try {
      const shops = await this.shopAnalyticsService.getAllShopsRanked();
      res.status(200).json(shops.map(s => AnalyticsMapper.toShopDTO(s)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Admin: POST /api/admin/analytics/replay ──────────────────────────────
  public triggerReplay = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }

    try {
      const reset = req.body?.reset !== false;
      await this.replayService.triggerReplay({ reset });
      res.status(202).json({ message: 'Analytics replay initiated', reset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Replay Status ────────────────────────────────────────────────────────
  public getReplayStatus = async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }
    res.status(200).json(this.progressTracker.getProgress());
  };

  // ─── Prometheus metrics (public) ─────────────────────────────────────────
  public getMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.metricsService.getMetricsString();
      res.set('Content-Type', 'text/plain').status(200).send(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private async resolveShopId(user: any): Promise<number | null> {
    if (user.role === 'admin') return null;
    const [rows] = await db.execute('SELECT id FROM shops WHERE user_id = ? LIMIT 1', [user.id]);
    const arr = rows as any[];
    return arr.length > 0 ? Number(arr[0].id) : null;
  }
}
