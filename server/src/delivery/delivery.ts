import { Express } from 'express';
import { SqlDeliveryAssignmentRepository } from './infrastructure/persistence/SqlDeliveryAssignmentRepository';
import { SqlDeliveryHistoryRepository } from './infrastructure/persistence/SqlDeliveryHistoryRepository';
import { SqlDeliveryAgentAvailabilityRepository } from './infrastructure/persistence/SqlDeliveryAgentAvailabilityRepository';
import { SqlOutboxRepository } from '../payments/infrastructure/persistence/SqlOutboxRepository';
import { AgentAvailabilityService } from './application/services/AgentAvailabilityService';
import { DeterministicDispatchStrategy } from './application/services/DeterministicDispatchStrategy';
import { DeliveryDispatchService } from './application/services/DeliveryDispatchService';
import { DeliveryAssignmentService } from './application/services/DeliveryAssignmentService';
import { DeliveryAuthorizationService } from './application/services/DeliveryAuthorizationService';
import { FulfillmentAssignedListener } from './application/events/FulfillmentAssignedListener';
import { DeliveryController } from './interfaces/controllers/DeliveryController';
import { createDeliveryRouter } from './routes/deliveries';
import { EventDispatcher } from '../payments/application/events/EventDispatcher';

export class DeliveryModule {
  public static register(app: Express, dispatcher: EventDispatcher): void {
    // 1. Instantiate Repositories
    const assignmentRepo = new SqlDeliveryAssignmentRepository();
    const historyRepo = new SqlDeliveryHistoryRepository();
    const availabilityRepo = new SqlDeliveryAgentAvailabilityRepository();
    const outboxRepo = new SqlOutboxRepository();

    // 2. Instantiate Services & Strategies
    const availabilityService = new AgentAvailabilityService(availabilityRepo);
    const dispatchStrategy = new DeterministicDispatchStrategy();
    const dispatchService = new DeliveryDispatchService(
      availabilityRepo,
      availabilityService,
      dispatchStrategy
    );
    const authService = new DeliveryAuthorizationService();
    const assignmentService = new DeliveryAssignmentService(
      assignmentRepo,
      historyRepo,
      outboxRepo,
      availabilityService,
      authService
    );

    // 3. Instantiate Listener
    const fulfillmentAssignedListener = new FulfillmentAssignedListener(assignmentService);

    // 4. Register listeners on the dispatcher
    dispatcher.register('FULFILLMENT_ASSIGNED', (payload) => fulfillmentAssignedListener.handle(payload));

    // 5. Instantiate Controller & Router
    const controller = new DeliveryController(
      assignmentService,
      dispatchService,
      outboxRepo
    );
    const router = createDeliveryRouter(controller);

    // 6. Mount routes
    app.use('/api/deliveries', router);

    console.log('✅ Delivery Domain Bounded Context initialized');
  }
}
