import { LifecycleState } from '../enums/LifecycleState';
import { ActorType } from '../enums/ActorType';

/**
 * TimelineEvent — an immutable historical checkpoint in the order journey.
 *
 * RFC-007 §9 / §36 — Timeline Entity
 *
 * Rules:
 *  - Timeline events are NEVER updated after insertion.
 *  - Timeline events are NEVER individually deleted (only cascade-deleted on rebuild).
 *  - They represent immutable historical facts.
 *  - Ordering: primary=occurredAt, secondary=eventVersion, tertiary=eventId (lexicographic).
 */
export class TimelineEvent {
  constructor(
    /** Auto-increment primary key. null before persistence. */
    public readonly id: number | null,

    /** FK to order_lifecycle_projections.order_id. */
    public readonly orderId: number,

    /**
     * UUID of the outbox event that triggered this timeline entry.
     * Stored for deduplication cross-reference and distributed tracing.
     */
    public readonly eventId: string,

    /** The outbox event type (e.g. ORDER_FINALIZED, PRINT_READY). */
    public readonly eventType: string,

    /** The lifecycle state snapshot at the time of this event. */
    public readonly state: LifecycleState,

    /** Human-readable headline shown in the customer UI (e.g. "Payment Confirmed"). */
    public readonly title: string,

    /** Contextual detail (e.g. "Invoice INV-2026-00142 generated."). */
    public readonly description: string,

    /**
     * When the business event occurred (from the outbox payload).
     * Used for deterministic timeline ordering.
     */
    public readonly occurredAt: Date,

    /** Who triggered this lifecycle event. */
    public readonly actorType: ActorType,

    /** Performer user ID; null for system-generated events. */
    public readonly actorId: number | null,

    /**
     * Arbitrary structured metadata (stored as JSON string in DB).
     * May include invoiceNumber, agentName, reason, etc.
     */
    public readonly metadata: Record<string, unknown> | null,

    /**
     * Traces all events back to the originating business transaction.
     * Propagated unchanged through all bounded contexts.
     */
    public readonly correlationId: string,

    /**
     * UUID of the immediate parent event that caused this one.
     * Allows parent-child event graph reconstruction.
     */
    public readonly causationId: string,
  ) {}
}
