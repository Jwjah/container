import { SchedulingEventHandler } from './SchedulingEventHandler';
import { DomainEvent } from '../../../tracking/domain/events/DomainEvent';
import { SchedulingContext } from './SchedulingContext';
import { SchedulingEngine } from '../services/SchedulingEngine';
import { QueueService } from '../services/QueueService';
import { InventoryService } from '../services/InventoryService';
import { MaintenancePlanner } from '../services/MaintenancePlanner';
import { IShopCapacityRepository } from '../../interfaces/IShopCapacityRepository';
import { IPrinterRepository } from '../../interfaces/IPrinterRepository';

/**
 * SchedulingEventDispatcher — routes incoming domain events to their mapped scheduling handlers.
 *
 * RFC-008 Part 5 Specification
 */
export class SchedulingEventDispatcher {
  private readonly handlers = new Map<string, SchedulingEventHandler>();

  constructor(
    private readonly schedulingEngine: SchedulingEngine,
    private readonly queueService: QueueService,
    private readonly inventoryService: InventoryService,
    private readonly maintenancePlanner: MaintenancePlanner,
    private readonly capacityRepo: IShopCapacityRepository,
    private readonly printerRepo: IPrinterRepository
  ) {}

  public register(eventType: string, handler: SchedulingEventHandler): void {
    this.handlers.set(eventType, handler);
  }

  /**
   * Routes the event to the matching scheduling handler inside a unified execution context.
   */
  public async dispatch(event: DomainEvent, connection?: any): Promise<boolean> {
    const handler = this.handlers.get(event.eventType);
    if (!handler) {
      // Return false if event is not registered (e.g. PAYMENT_INTENT_CREATED is ignored by scheduling)
      return false;
    }

    const context: SchedulingContext = {
      schedulingEngine: this.schedulingEngine,
      queueService: this.queueService,
      inventoryService: this.inventoryService,
      maintenancePlanner: this.maintenancePlanner,
      capacityRepo: this.capacityRepo,
      printerRepo: this.printerRepo,
      connection
    };

    await handler.handle(event, context);
    return true;
  }
}
