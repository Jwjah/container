import { Router } from 'express';
import { AnalyticsController } from './AnalyticsController';
import { AnalyticsValidation } from './AnalyticsValidation';
// @ts-ignore
import { authenticate, authorize } from '../../middleware/auth';

/**
 * Creates and mounts all routes for the analytics bounded context.
 * RFC-010 Specification
 */
export function createAnalyticsRoutes(controller: AnalyticsController): Router {
  const router = Router();

  // ─── Student ───────────────────────────────────────────────────────────────
  router.get('/analytics/me', authenticate, controller.getMyAnalytics);

  // ─── Shop ─────────────────────────────────────────────────────────────────
  router.get(
    '/analytics/shop',
    authenticate,
    authorize('shop', 'admin'),
    controller.getShopAnalytics
  );

  router.get(
    '/analytics/shop/daily',
    authenticate,
    authorize('shop', 'admin'),
    AnalyticsValidation.validateDaysParam,
    controller.getShopDailyAnalytics
  );

  router.get(
    '/analytics/shop/performance',
    authenticate,
    authorize('shop', 'admin'),
    controller.getShopPerformance
  );

  // ─── Admin ────────────────────────────────────────────────────────────────
  router.get(
    '/admin/analytics/platform',
    authenticate,
    authorize('admin'),
    AnalyticsValidation.validateDaysParam,
    controller.getPlatformReport
  );

  router.get(
    '/admin/analytics/revenue',
    authenticate,
    authorize('admin'),
    AnalyticsValidation.validateDaysParam,
    controller.getRevenueReport
  );

  router.get(
    '/admin/analytics/orders',
    authenticate,
    authorize('admin'),
    AnalyticsValidation.validateDaysParam,
    controller.getOrdersReport
  );

  router.get(
    '/admin/analytics/shops',
    authenticate,
    authorize('admin'),
    controller.getShopsRanking
  );

  router.post(
    '/admin/analytics/replay',
    authenticate,
    authorize('admin'),
    controller.triggerReplay
  );

  router.get(
    '/admin/analytics/replay/status',
    authenticate,
    authorize('admin'),
    controller.getReplayStatus
  );

  // ─── Prometheus scrape (public) ────────────────────────────────────────────
  router.get('/analytics/metrics', controller.getMetrics);

  return router;
}
