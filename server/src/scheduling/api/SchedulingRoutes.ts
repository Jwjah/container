import { Router } from 'express';
import { SchedulingController } from './SchedulingController';
import { SchedulingValidation } from './SchedulingValidation';
// @ts-ignore
import { authenticate, authorize } from '../../middleware/auth';

/**
 * Creates and mounts all routes for the scheduling bounded context.
 */
export function createSchedulingRoutes(controller: SchedulingController): Router {
  const router = Router();

  router.get(
    '/shops/:shopId/capacity',
    authenticate,
    SchedulingValidation.validateShopId,
    controller.getShopCapacity
  );

  router.get(
    '/shops/:shopId/forecast',
    authenticate,
    SchedulingValidation.validateShopId,
    controller.getCapacityForecast
  );

  router.get(
    '/shops/:shopId/printers',
    authenticate,
    authorize('shop', 'admin'),
    SchedulingValidation.validateShopId,
    controller.getShopPrinters
  );

  router.get(
    '/shops/:shopId/queue',
    authenticate,
    authorize('shop', 'admin'),
    SchedulingValidation.validateShopId,
    controller.getShopQueue
  );

  router.get(
    '/orders/:orderId/eta',
    authenticate,
    SchedulingValidation.validateOrderId,
    controller.getOrderEta
  );

  router.post(
    '/shops/:shopId/inventory/replenish',
    authenticate,
    authorize('shop', 'admin'),
    SchedulingValidation.validateShopId,
    SchedulingValidation.validateReplenish,
    controller.replenishInventory
  );

  // Replay endpoints
  router.post(
    '/replay',
    authenticate,
    authorize('admin'),
    controller.triggerReplay
  );

  router.get(
    '/replay/status',
    authenticate,
    authorize('admin'),
    controller.getReplayStatus
  );

  // Prometheus Metrics scraping
  router.get('/metrics', controller.getMetrics);

  return router;
}
