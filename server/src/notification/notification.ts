import { Express } from 'express';
import { SqlNotificationRepository } from './infrastructure/repositories/SqlNotificationRepository';
import { SqlNotificationTemplateRepository } from './infrastructure/repositories/SqlNotificationTemplateRepository';
import { SqlNotificationPreferenceRepository } from './infrastructure/repositories/SqlNotificationPreferenceRepository';
import { SqlNotificationBatchRepository } from './infrastructure/repositories/SqlNotificationBatchRepository';

import { TemplateEngine } from './application/services/TemplateEngine';
import { PreferenceResolver } from './application/services/PreferenceResolver';
import { EmailChannelHandler } from './application/services/EmailChannelHandler';
import { InAppChannelHandler } from './application/services/InAppChannelHandler';
import { ChannelRouter } from './application/services/ChannelRouter';
import { DeliveryService } from './application/services/DeliveryService';
import { NotificationService } from './application/services/NotificationService';

import { NotificationEventSource } from './worker/NotificationEventSource';
import { NotificationEventDispatcher } from './worker/NotificationEventDispatcher';
import { NotificationEventWorker } from './worker/NotificationEventWorker';
import {
  OrderCreatedHandler,
  PaymentConfirmedHandler,
  LowStockHandler,
  WithdrawalRequestedHandler,
  WithdrawalApprovedHandler,
  WithdrawalRejectedHandler,
  WithdrawalCompletedHandler,
  DeliveryTimeoutHandler,
  PickupConversionHandler
} from './application/events/NotificationEventHandlers';

import { ReplayProgressTracker } from './application/replay/ReplayProgressTracker';
import { NotificationReplayWorker } from './application/replay/NotificationReplayWorker';
import { NotificationReplayService } from './application/replay/NotificationReplayService';
import { NotificationMetricsService } from './application/metrics/NotificationMetricsService';

import { NotificationController } from './api/NotificationController';
import { createNotificationRoutes } from './api/NotificationRoutes';

/**
 * NotificationModule — self-contained bootstrap loader for the notification context (RFC-009).
 */
export class NotificationModule {
  public static register(app: Express): void {
    // 1. Repositories
    const notifRepo = new SqlNotificationRepository();
    const templateRepo = new SqlNotificationTemplateRepository();
    const preferenceRepo = new SqlNotificationPreferenceRepository();
    const batchRepo = new SqlNotificationBatchRepository();

    // 2. Services
    const templateEngine = new TemplateEngine();
    const prefResolver = new PreferenceResolver(preferenceRepo);
    const emailHandler = new EmailChannelHandler();
    const inAppHandler = new InAppChannelHandler(notifRepo);
    const channelRouter = new ChannelRouter(prefResolver);
    const deliveryService = new DeliveryService(notifRepo, emailHandler, inAppHandler, channelRouter, templateEngine);
    const notifService = new NotificationService(templateRepo, deliveryService);

    // 3. Worker & Dispatcher
    const eventSource = new NotificationEventSource();
    const dispatcher = new NotificationEventDispatcher();

    // Register event subscriptions
    dispatcher.register('ORDER_CREATED', new OrderCreatedHandler(notifService));
    dispatcher.register('PAYMENT_CONFIRMED', new PaymentConfirmedHandler(notifService));
    dispatcher.register('LOW_STOCK', new LowStockHandler(notifService));
    dispatcher.register('WITHDRAWAL_REQUESTED', new WithdrawalRequestedHandler(notifService));
    dispatcher.register('WITHDRAWAL_APPROVED', new WithdrawalApprovedHandler(notifService));
    dispatcher.register('WITHDRAWAL_REJECTED', new WithdrawalRejectedHandler(notifService));
    dispatcher.register('WITHDRAWAL_COMPLETED', new WithdrawalCompletedHandler(notifService));
    dispatcher.register('DELIVERY_TIMEOUT', new DeliveryTimeoutHandler(notifService));
    dispatcher.register('PICKUP_CONVERSION', new PickupConversionHandler(notifService));

    // Polling event worker
    const worker = new NotificationEventWorker(eventSource, dispatcher, 1000, 10);
    worker.start();

    // 4. Replay System
    const replayProgress = new ReplayProgressTracker();
    const replayWorker = new NotificationReplayWorker(dispatcher, replayProgress);
    const replayService = new NotificationReplayService(worker, replayWorker, replayProgress);

    // 5. Controller & Router
    const metricsService = new NotificationMetricsService();
    const controller = new NotificationController(
      notifRepo,
      templateRepo,
      preferenceRepo,
      metricsService,
      replayService,
      replayProgress
    );

    // Mount Express REST routes
    const router = createNotificationRoutes(controller);
    app.use('/api', router);

    console.log('✅ [NotificationModule] Bootstrapped and registered routing.');
  }
}
