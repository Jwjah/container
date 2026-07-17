import { Express } from 'express';
import { SqlFulfillmentRepository } from '../payments/infrastructure/persistence/SqlFulfillmentRepository';
import { SqlFulfillmentHistoryRepository } from '../payments/infrastructure/persistence/SqlFulfillmentHistoryRepository';
import { SqlOrderRepository } from '../payments/infrastructure/persistence/SqlOrderRepository';
import { SqlPrintJobRepository } from '../payments/infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from '../payments/infrastructure/persistence/SqlOutboxRepository';
import { OtpService } from '../payments/application/services/OtpService';
import { FulfillmentAuthorizationService } from '../payments/application/services/FulfillmentAuthorizationService';
import { FulfillmentService } from '../payments/application/services/FulfillmentService';
import { PrintReadyListener } from '../payments/application/events/PrintReadyListener';
import { NotificationConsumer } from '../payments/application/events/NotificationConsumer';
import { FulfillmentController } from '../payments/interfaces/controllers/FulfillmentController';
import { createFulfillmentRouter } from '../payments/routes/fulfillments';
import { EventDispatcher } from '../payments/application/events/EventDispatcher';
import { DeliveryAgentRejectedListener } from '../payments/application/events/DeliveryAgentRejectedListener';
import { DeliveryPickupCompletedListener } from '../payments/application/events/DeliveryPickupCompletedListener';
import { DeliveryCompletedListener } from '../payments/application/events/DeliveryCompletedListener';
import { DeliveryFailedListener } from '../payments/application/events/DeliveryFailedListener';
import { DeliveryDispatchRequestListner } from '../payments/application/events/DeliveryDispatchRequestListner';
import { DeliveryAgentAssignedListener } from '../payments/application/events/DeliveryAgentAssignedListener';

export class FulfillmentModule {
  public static register(app: Express, dispatcher: EventDispatcher): void {
    // 1. Instantiate Repositories
    const fulfillmentRepo = new SqlFulfillmentRepository();
    const historyRepo = new SqlFulfillmentHistoryRepository();
    const orderRepo = new SqlOrderRepository();
    const printJobRepo = new SqlPrintJobRepository();
    const outboxRepo = new SqlOutboxRepository();

    // 2. Instantiate Services
    const otpService = new OtpService();
    const authService = new FulfillmentAuthorizationService();
    const service = new FulfillmentService(
      fulfillmentRepo,
      historyRepo,
      orderRepo,
      printJobRepo,
      outboxRepo,
      otpService,
      authService
    );

    // 3. Instantiate Listeners and Consumers
    const printReadyListener = new PrintReadyListener(service);
    const notificationConsumer = new NotificationConsumer();
    const deliveryAgentRejectedListener = new DeliveryAgentRejectedListener(service);
    const deliveryPickupCompletedListener = new DeliveryPickupCompletedListener(service);
    const deliveryCompletedListener = new DeliveryCompletedListener(service);
    const deliveryFailedListener = new DeliveryFailedListener(service);
    const deliveryDispatchRequestListener = new DeliveryDispatchRequestListner(service);
    const deliveryAgentAssignedListener = new DeliveryAgentAssignedListener(service);

    // 4. Register Listeners to EventDispatcher
    dispatcher.register('ORDER_FINALIZED', (payload) => notificationConsumer.handleOrderFinalized(payload));
    dispatcher.register('PRINT_READY', (payload) => printReadyListener.handle(payload));
    dispatcher.register('FULFILLMENT_ASSIGNED', (payload) => notificationConsumer.handleFulfillmentAssigned(payload));
    dispatcher.register('FULFILLMENT_STARTED', (payload) => notificationConsumer.handleFulfillmentStarted(payload));
    dispatcher.register('DELIVERY_COMPLETED', (payload) => notificationConsumer.handleDeliveryCompleted(payload));
    dispatcher.register('PICKUP_COMPLETED', (payload) => notificationConsumer.handlePickupCompleted(payload));
    dispatcher.register('DELIVERY_FAILED', (payload) => notificationConsumer.handleDeliveryFailed(payload));
    dispatcher.register('OTP_REGENERATED', (payload) => notificationConsumer.handleOtpRegenerated(payload));

    // Register Delivery Domain Integration Listeners
    dispatcher.register('DELIVERY_AGENT_REJECTED', (payload) => deliveryAgentRejectedListener.handle(payload));
    dispatcher.register('DELIVERY_PICKUP_COMPLETED', (payload) => deliveryPickupCompletedListener.handle(payload));
    dispatcher.register('DELIVERY_COMPLETED', (payload) => deliveryCompletedListener.handle(payload));
    dispatcher.register('DELIVERY_FAILED', (payload) => deliveryFailedListener.handle(payload));
    dispatcher.register('DELIVERY_DISPATCH_REQUESTED', (payload) => deliveryDispatchRequestListener.handle(payload));
    dispatcher.register('DELIVERY_AGENT_ASSIGNED', (payload) => deliveryAgentAssignedListener.handle(payload));

    // 5. Instantiate Controller & Router
    const controller = new FulfillmentController(service);
    const router = createFulfillmentRouter(controller);

    // 6. Mount Routes
    app.use('/api/fulfillments', router);

    console.log('✅ Fulfillment Domain Bounded Context initialized');
  }
}
