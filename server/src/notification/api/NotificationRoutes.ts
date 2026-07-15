import { Router } from 'express';
import { NotificationController } from './NotificationController';
import { NotificationValidation } from './NotificationValidation';
// @ts-ignore
import { authenticate, authorize } from '../../middleware/auth';

/**
 * Creates and mounts all routes for the notification bounded context.
 *
 * RFC-009 Specification
 */
export function createNotificationRoutes(controller: NotificationController): Router {
  const router = Router();

  // Notifications List & Detail
  router.get(
    '/notifications',
    authenticate,
    controller.getNotifications
  );

  router.get(
    '/notifications/metrics',
    controller.getMetrics
  );

  router.get(
    '/notifications/:id',
    authenticate,
    NotificationValidation.validateNotificationId,
    controller.getNotificationById
  );

  router.patch(
    '/notifications/read-all',
    authenticate,
    controller.markAllAsRead
  );

  router.patch(
    '/notifications/:id/read',
    authenticate,
    NotificationValidation.validateNotificationId,
    controller.markAsRead
  );

  // Preferences Management
  router.get(
    '/notification-preferences',
    authenticate,
    controller.getPreferences
  );

  router.put(
    '/notification-preferences',
    authenticate,
    NotificationValidation.validatePreferencesPayload,
    controller.updatePreferences
  );

  // Admin Templates Routing
  router.post(
    '/admin/notification-templates',
    authenticate,
    authorize('admin'),
    NotificationValidation.validateTemplatePayload,
    controller.createTemplate
  );

  router.get(
    '/admin/notification-templates/:name',
    authenticate,
    authorize('admin'),
    controller.getTemplates
  );

  // Rebuild/Replay Routing
  router.post(
    '/admin/notifications/replay',
    authenticate,
    authorize('admin'),
    controller.triggerReplay
  );

  router.get(
    '/admin/notifications/replay/status',
    authenticate,
    authorize('admin'),
    controller.getReplayStatus
  );

  return router;
}
