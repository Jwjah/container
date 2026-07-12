import { OutboxEvent } from '../domain/entities/OutboxEvent';

export interface IOutboxRepository {
  create(event: OutboxEvent, connection?: any): Promise<OutboxEvent>;
  claimBatch(limit: number, workerId: string, connection?: any): Promise<OutboxEvent[]>;
  update(event: OutboxEvent, connection?: any): Promise<OutboxEvent>;
  recoverStaleEvents(timeoutMs: number, connection?: any): Promise<number>;
}
