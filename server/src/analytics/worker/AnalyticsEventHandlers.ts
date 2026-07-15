import { AnalyticsEventHandler } from './AnalyticsEventDispatcher';
import { DomainEvent } from '../../tracking/domain/events/DomainEvent';
import { IOrderFactRepository } from '../interfaces/IOrderFactRepository';
import { IAnalyticsMetricRepository } from '../interfaces/IAnalyticsMetricRepository';
import { IShopAnalyticsRepository } from '../interfaces/IShopAnalyticsRepository';
import { IUserAnalyticsRepository } from '../interfaces/IUserAnalyticsRepository';
import { OrderFact } from '../domain/entities/OrderFact';
import { AnalyticsAggregationService } from '../application/services/AnalyticsAggregationService';
import { AnalyticsMetricsService } from '../application/metrics/AnalyticsMetricsService';

/**
 * Base helper that upserts an OrderFact from an event payload, then triggers re-aggregation.
 */
abstract class BaseAnalyticsHandler {
  constructor(
    protected readonly factRepo: IOrderFactRepository,
    protected readonly aggregationService: AnalyticsAggregationService
  ) {}

  protected async upsertFactAndAggregate(
    orderId: number,
    shopId: number,
    userId: number,
    date: string,
    patchFact: (existing: OrderFact) => void,
    connection?: any
  ): Promise<void> {
    let fact = await this.factRepo.findByOrderId(orderId, connection);
    if (!fact) {
      fact = new OrderFact(
        null, orderId, shopId, userId, date,
        0, 0, false, new Date(), null, null, null, null, null
      );
    }
    patchFact(fact);
    await this.factRepo.upsert(fact, connection);
    await this.aggregationService.aggregateDailyMetrics(fact.date, connection);
    await this.aggregationService.aggregateShopMetrics(fact.shopId, connection);
    await this.aggregationService.aggregateUserMetrics(fact.userId, connection);
    AnalyticsMetricsService.eventsProcessedCount++;
  }
}

/**
 * ORDER_CREATED — creates the initial order fact record.
 */
export class OrderCreatedAnalyticsHandler extends BaseAnalyticsHandler implements AnalyticsEventHandler {
  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, userId, totalPrice = 0, totalPages = 0, color = false } = event.payload;
    if (!orderId || !shopId || !userId) return;

    const date = event.occurredAt.toISOString().slice(0, 10);
    await this.upsertFactAndAggregate(
      Number(orderId), Number(shopId), Number(userId), date,
      fact => {
        fact.revenue = Number(totalPrice);
        fact.pageCount = Number(totalPages);
        fact.isColor = Boolean(color);
        fact.orderCreatedAt = event.occurredAt;
      },
      connection
    );
  }
}

/**
 * PAYMENT_CONFIRMED — records payment timestamp.
 */
export class PaymentConfirmedAnalyticsHandler extends BaseAnalyticsHandler implements AnalyticsEventHandler {
  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, userId, amount } = event.payload;
    if (!orderId) return;

    const date = event.occurredAt.toISOString().slice(0, 10);
    await this.upsertFactAndAggregate(
      Number(orderId), Number(shopId ?? 0), Number(userId ?? 0), date,
      fact => {
        fact.paymentConfirmedAt = event.occurredAt;
        if (amount) fact.revenue = Number(amount);
      },
      connection
    );
  }
}

/**
 * PRINT_STARTED — records print start timestamp.
 */
export class PrintStartedAnalyticsHandler extends BaseAnalyticsHandler implements AnalyticsEventHandler {
  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, userId } = event.payload;
    if (!orderId) return;

    const date = event.occurredAt.toISOString().slice(0, 10);
    await this.upsertFactAndAggregate(
      Number(orderId), Number(shopId ?? 0), Number(userId ?? 0), date,
      fact => { fact.printStartedAt = event.occurredAt; },
      connection
    );
  }
}

/**
 * PRINT_COMPLETED — records print completion and triggers completion time calculation.
 */
export class PrintCompletedAnalyticsHandler extends BaseAnalyticsHandler implements AnalyticsEventHandler {
  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, userId } = event.payload;
    if (!orderId) return;

    const date = event.occurredAt.toISOString().slice(0, 10);
    await this.upsertFactAndAggregate(
      Number(orderId), Number(shopId ?? 0), Number(userId ?? 0), date,
      fact => { fact.printCompletedAt = event.occurredAt; },
      connection
    );
  }
}

/**
 * DELIVERY_COMPLETED — records delivery completion and triggers delivery time calculation.
 */
export class DeliveryCompletedAnalyticsHandler extends BaseAnalyticsHandler implements AnalyticsEventHandler {
  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, userId } = event.payload;
    if (!orderId) return;

    const date = event.occurredAt.toISOString().slice(0, 10);
    await this.upsertFactAndAggregate(
      Number(orderId), Number(shopId ?? 0), Number(userId ?? 0), date,
      fact => { fact.deliveryCompletedAt = event.occurredAt; },
      connection
    );
  }
}

/**
 * ORDER_CANCELLED — marks the order fact as cancelled.
 */
export class OrderCancelledAnalyticsHandler extends BaseAnalyticsHandler implements AnalyticsEventHandler {
  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const { orderId, shopId, userId } = event.payload;
    if (!orderId) return;

    const date = event.occurredAt.toISOString().slice(0, 10);
    await this.upsertFactAndAggregate(
      Number(orderId), Number(shopId ?? 0), Number(userId ?? 0), date,
      fact => { fact.cancelledAt = event.occurredAt; },
      connection
    );
  }
}

/**
 * LOW_STOCK — increments low stock event counter on the daily metric.
 */
export class LowStockAnalyticsHandler implements AnalyticsEventHandler {
  constructor(private readonly metricRepo: IAnalyticsMetricRepository) {}

  async handle(event: DomainEvent, connection?: any): Promise<void> {
    const date = event.occurredAt.toISOString().slice(0, 10);
    const executor = connection || null;
    const existing = await this.metricRepo.findByDate(date, executor);
    if (existing) {
      existing.lowStockEvents += 1;
      await this.metricRepo.upsert(existing, executor);
    }
    AnalyticsMetricsService.eventsProcessedCount++;
  }
}
