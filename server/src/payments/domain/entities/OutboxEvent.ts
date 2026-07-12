import { OutboxEventStatus } from '../enums/OutboxEventStatus';

export class OutboxEvent {
  constructor(
    public readonly id: number | null,
    public readonly eventId: string,
    public readonly eventType: string,
    public readonly aggregateType: string,
    public readonly aggregateId: string,
    public readonly payload: string,
    public status: OutboxEventStatus,
    public retryCount: number = 0,
    public errorLog: string | null = null,
    public readonly correlationId: string,
    public readonly eventVersion: number = 1,
    public readonly occurredAt: Date = new Date(),
    public workerId: string | null = null,
    public processingStartedAt: Date | null = null,
    public processedAt: Date | null = null,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}
}
