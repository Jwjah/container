import { Router } from 'express';
import { TrackingController } from './TrackingController';
import { ReplayController } from './ReplayController';
import { TrackingValidation } from './TrackingValidation';
import { SqlOrderLifecycleProjectionRepository } from '../infrastructure/repositories/SqlOrderLifecycleProjectionRepository';
import { SqlTimelineEventRepository } from '../infrastructure/repositories/SqlTimelineEventRepository';
import { SqlProcessedEventsRepository } from '../infrastructure/repositories/SqlProcessedEventsRepository';
import { ProjectionWorker } from '../worker/ProjectionWorker';
import { ReplayService } from '../application/replay/ReplayService';

const { authenticate, authorize } = require('../../middleware/auth');

export function createTrackingRouter(
  projRepo: SqlOrderLifecycleProjectionRepository,
  timelineRepo: SqlTimelineEventRepository,
  processedEventsRepo: SqlProcessedEventsRepository,
  worker?: ProjectionWorker,
  replayService?: ReplayService
): Router {
  const router = Router();
  
  const controller = new TrackingController(
    projRepo,
    timelineRepo,
    processedEventsRepo,
    worker,
    replayService
  );

  // Customer APIs
  router.get(
    '/orders/:orderId/tracking',
    authenticate,
    TrackingValidation.validateOrderId,
    controller.getOrderTracking
  );

  router.get(
    '/orders/:orderId/timeline',
    authenticate,
    TrackingValidation.validateOrderId,
    TrackingValidation.validatePagination,
    controller.getOrderTimeline
  );

  // Shop APIs
  router.get(
    '/shop/orders/:orderId/tracking',
    authenticate,
    TrackingValidation.validateOrderId,
    controller.getShopOrderTracking
  );

  // Admin APIs
  router.get(
    '/admin/orders/:orderId/tracking',
    authenticate,
    authorize('admin'),
    TrackingValidation.validateOrderId,
    controller.getAdminOrderTracking
  );

  // Admin Diagnostics
  router.get(
    '/internal/projection/status',
    authenticate,
    authorize('admin'),
    controller.getProjectionStatus
  );

  // Replay Administration endpoints
  if (replayService) {
    const replayController = new ReplayController(replayService);

    router.post(
      '/internal/projection/replay',
      authenticate,
      authorize('admin'),
      replayController.triggerReplay
    );

    router.post(
      '/internal/projection/replay/pause',
      authenticate,
      authorize('admin'),
      replayController.pauseReplay
    );

    router.post(
      '/internal/projection/replay/resume',
      authenticate,
      authorize('admin'),
      replayController.resumeReplay
    );

    router.post(
      '/internal/projection/replay/cancel',
      authenticate,
      authorize('admin'),
      replayController.cancelReplay
    );

    router.get(
      '/internal/projection/replay/status',
      authenticate,
      authorize('admin'),
      replayController.getReplayStatus
    );
  }

  // Health check routes
  router.get('/health', controller.getHealth);
  router.get('/health/live', controller.getHealthLive);
  router.get('/health/ready', controller.getHealthReady);

  return router;
}
