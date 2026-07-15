import { Express } from 'express';
import { SqlShopCapacityRepository } from './infrastructure/repositories/SqlShopCapacityRepository';
import { SqlPrinterRepository } from './infrastructure/repositories/SqlPrinterRepository';
import { SqlInventoryRepository } from './infrastructure/repositories/SqlInventoryRepository';
import { SqlSchedulingSnapshotRepository } from './infrastructure/repositories/SqlSchedulingSnapshotRepository';

import { CapacityCalculator } from './application/services/CapacityCalculator';
import { InventoryService } from './application/services/InventoryService';
import { ECTSchedulingStrategy } from './application/strategies/ECTSchedulingStrategy';
import { PrinterAssignmentService } from './application/services/PrinterAssignmentService';
import { QueueService } from './application/services/QueueService';
import { MaintenancePlanner } from './application/services/MaintenancePlanner';
import { EtaCalculationService } from './application/services/EtaCalculationService';
import { CapacityForecastService } from './application/services/CapacityForecastService';
import { SchedulingSnapshotService } from './application/services/SchedulingSnapshotService';
import { SchedulingEngine } from './application/services/SchedulingEngine';

import { SchedulingEventSource } from './worker/SchedulingEventSource';
import { SchedulingEventDispatcher } from './application/events/SchedulingEventDispatcher';
import { SchedulingEventWorker } from './worker/SchedulingEventWorker';
import { ReplayProgressTracker } from './application/replay/ReplayProgressTracker';
import { SchedulingReplayWorker } from './application/replay/SchedulingReplayWorker';
import { SchedulingReplayService } from './application/replay/SchedulingReplayService';
import { SchedulingMetricsService } from './application/metrics/SchedulingMetricsService';

import {
  OrderCreatedHandler,
  OrderCancelledHandler,
  PrintStartedHandler,
  PrintCompletedHandler,
  PrinterOfflineHandler,
  MaintenanceScheduledHandler
} from './application/events/SchedulingEventHandlers';

import { SchedulingController } from './api/SchedulingController';
import { createSchedulingRoutes } from './api/SchedulingRoutes';

/**
 * SchedulingModule — self-contained bootstrap loader for the scheduling context (RFC-008).
 */
export class SchedulingModule {
  public static register(app: Express): void {
    // 1. Repositories
    const capacityRepo = new SqlShopCapacityRepository();
    const printerRepo = new SqlPrinterRepository();
    const inventoryRepo = new SqlInventoryRepository();
    const snapshotRepo = new SqlSchedulingSnapshotRepository();

    // 2. Services
    const capacityCalculator = new CapacityCalculator(capacityRepo, printerRepo);
    const inventoryService = new InventoryService(inventoryRepo);
    const strategy = new ECTSchedulingStrategy();
    const assignmentService = new PrinterAssignmentService(printerRepo, strategy);
    const queueService = new QueueService(printerRepo, assignmentService);
    const maintenancePlanner = new MaintenancePlanner(printerRepo);
    const etaService = new EtaCalculationService(printerRepo, strategy);
    const forecastService = new CapacityForecastService(capacityRepo, printerRepo, inventoryRepo);
    const snapshotService = new SchedulingSnapshotService(capacityRepo, printerRepo, inventoryRepo, snapshotRepo);

    // 3. Worker & Dispatcher
    const eventSource = new SchedulingEventSource();
    const dispatcher = new SchedulingEventDispatcher(
      new SchedulingEngine(capacityCalculator, inventoryService, assignmentService),
      queueService,
      inventoryService,
      maintenancePlanner,
      capacityRepo,
      printerRepo
    );

    // Register event subscriptions
    dispatcher.register('ORDER_CREATED', new OrderCreatedHandler());
    dispatcher.register('ORDER_CANCELLED', new OrderCancelledHandler());
    dispatcher.register('PRINT_STARTED', new PrintStartedHandler());
    dispatcher.register('PRINT_COMPLETED', new PrintCompletedHandler());
    dispatcher.register('PRINTER_OFFLINE', new PrinterOfflineHandler());
    dispatcher.register('MAINTENANCE_SCHEDULED', new MaintenanceScheduledHandler());

    // Polling event worker
    const worker = new SchedulingEventWorker(eventSource, dispatcher, 1000, 10);
    worker.start();

    // 4. Replay System
    const replayProgress = new ReplayProgressTracker();
    const replayWorker = new SchedulingReplayWorker(dispatcher, replayProgress);
    const replayService = new SchedulingReplayService(
      this.getReplayRepositoryStub(),
      worker,
      replayWorker,
      replayProgress,
      snapshotService
    );

    // 5. Controller & Router
    const metricsService = new SchedulingMetricsService(eventSource);
    const controller = new SchedulingController(
      capacityRepo,
      printerRepo,
      inventoryService,
      etaService,
      forecastService,
      replayService,
      replayProgress,
      metricsService
    );

    // Mount Express REST routes
    const router = createSchedulingRoutes(controller);
    app.use('/api/scheduling', router);

    console.log('✅ [SchedulingModule] Bootstrapped and registered routing.');
  }

  private static getReplayRepositoryStub(): any {
    const { ReplayRepository } = require('./infrastructure/replay/ReplayRepository');
    return new ReplayRepository();
  }
}
