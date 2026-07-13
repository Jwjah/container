/**
 * DomainEvent — represents an incoming business event inside the tracking subsystem.
 *
 * RFC-007 §12
 */
export interface DomainEvent {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  correlationId: string;
  causationId: string;
  payload: any;
}
