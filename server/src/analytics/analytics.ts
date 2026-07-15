import { Express } from 'express';

// Repositories
import { SqlAnalyticsMetricRepository } from './infrastructure/repositories/SqlAnalyticsMetricRepository';
import { SqlShopAnalyticsRepository } from './infrastructure/repositories/SqlShopAnalyticsRepository';
import { SqlUserAnalyticsRepository } from './infrastructure/repositories/SqlUserAnalyticsRepository';
import { SqlOrderFactRepository } from './infrastructure/repositories/SqlOrderFactRepository';

// Application Services
import { AnalyticsAggregationService } from './application/services/AnalyticsAggregationService';
import { MetricsCalculationService } from './application/services/MetricsCalculationService';
import { ShopAnalyticsService } from './application/services/ShopAnalyticsService';
import { UserAnalyticsService } from './application/services/UserAnalyticsService';
import { RevenueService } from './application/services/RevenueService';
import { ReportingService } from './application/services/ReportingService';
import { AnalyticsSnapshotService } from './application/services/AnalyticsSnapshotService';

// Replay
import { AnalyticsReplayProgressTracker } from './application/replay/AnalyticsReplayProgressTracker';
import { AnalyticsReplayWorker } from './application/replay/AnalyticsReplayWorker';
import { AnalyticsReplayService } from './application/replay/AnalyticsReplayService';

// Metrics
import { AnalyticsMetricsService } from './application/metrics/AnalyticsMetricsService';

// Worker
import { AnalyticsEventSource } from './worker/AnalyticsEventSource';
import { AnalyticsEventDispatcher } from './worker/AnalyticsEventDispatcher';
import { AnalyticsWorker } from './worker/AnalyticsWorker';
import {
  OrderCreatedAnalyticsHandler,
  PaymentConfirmedAnalyticsHandler,
  PrintStartedAnalyticsHandler,
  PrintCompletedAnalyticsHandler,
  DeliveryCompletedAnalyticsHandler,
  OrderCancelledAnalyticsHandler,
  LowStockAnalyticsHandler
} from './worker/AnalyticsEventHandlers';

// API
import { AnalyticsController } from './api/AnalyticsController';
import { createAnalyticsRoutes } from './api/AnalyticsRoutes';

/**
 * AnalyticsModule — self-contained bootstrap for RFC-010.
 * Wires all dependencies and registers routes with Express.
 */
export class AnalyticsModule {
  public static register(app: Express): void {
    // 1. Repositories
    const metricRepo = new SqlAnalyticsMetricRepository();
    const shopRepo = new SqlShopAnalyticsRepository();
    const userRepo = new SqlUserAnalyticsRepository();
    const factRepo = new SqlOrderFactRepository();

    // 2. Application Services
    const aggregationService = new AnalyticsAggregationService(factRepo, metricRepo, shopRepo, userRepo);
    const metricsCalcService = new MetricsCalculationService(metricRepo, shopRepo, factRepo);
    const shopAnalyticsService = new ShopAnalyticsService(shopRepo, factRepo);
    const userAnalyticsService = new UserAnalyticsService(userRepo, factRepo);
    const revenueService = new RevenueService(metricRepo, factRepo);
    const reportingService = new ReportingService(metricRepo, shopRepo, factRepo);
    const snapshotService = new AnalyticsSnapshotService(metricRepo, shopRepo, factRepo);

    // 3. Worker & Dispatcher
    const eventSource = new AnalyticsEventSource();
    const dispatcher = new AnalyticsEventDispatcher();

    // Register event handlers
    dispatcher.register('ORDER_CREATED',        new OrderCreatedAnalyticsHandler(factRepo, aggregationService));
    dispatcher.register('PAYMENT_CONFIRMED',    new PaymentConfirmedAnalyticsHandler(factRepo, aggregationService));
    dispatcher.register('PRINT_STARTED',        new PrintStartedAnalyticsHandler(factRepo, aggregationService));
    dispatcher.register('PRINT_COMPLETED',      new PrintCompletedAnalyticsHandler(factRepo, aggregationService));
    dispatcher.register('DELIVERY_COMPLETED',   new DeliveryCompletedAnalyticsHandler(factRepo, aggregationService));
    dispatcher.register('ORDER_CANCELLED',      new OrderCancelledAnalyticsHandler(factRepo, aggregationService));
    dispatcher.register('LOW_STOCK',            new LowStockAnalyticsHandler(metricRepo));

    const worker = new AnalyticsWorker(eventSource, dispatcher, 200, 10);

    // 4. Replay
    const progressTracker = new AnalyticsReplayProgressTracker();
    const replayWorker = new AnalyticsReplayWorker(dispatcher, progressTracker);
    const replayService = new AnalyticsReplayService(worker, replayWorker, progressTracker);

    // 5. Metrics
    const metricsService = new AnalyticsMetricsService(eventSource);

    // 6. Controller & Routes
    const controller = new AnalyticsController(
      shopAnalyticsService,
      userAnalyticsService,
      revenueService,
      reportingService,
      metricsService,
      replayService,
      progressTracker
    );

    const router = createAnalyticsRoutes(controller);
    app.use('/api', router);

    // 7. Start background worker
    worker.start();

    console.log('✅ [AnalyticsModule] RFC-010 Analytics bounded context registered');
  }
}
