import { LifecycleState } from '../enums/LifecycleState';

/**
 * OrderLifecycleProjection — the CQRS Read Model Projection Root.
 *
 * RFC-007 §8 / §35 — Projection Root
 *
 * This is NOT a traditional DDD Aggregate. It owns no business invariants.
 * It is a derived read model built entirely from domain events.
 * It can be deleted and rebuilt at any time without affecting write-side domains.
 *
 * Rules:
 *  - This entity must NEVER accept write commands from external callers.
 *  - currentState must NEVER be set directly — always derived via LifecycleStateMapper.
 *  - All mutations are performed exclusively by ProjectionUpdateService.
 */
export class OrderLifecycleProjection {
  constructor(
    /** Primary key — matches orders.id on the write side. */
    public readonly orderId: number,

    /** Unique customer-facing token used in tracking URLs. */
    public readonly orderHash: string,

    /** Owner student. Used for authorization filtering. */
    public readonly studentId: number,

    /** Print shop. Used for merchant dashboard filtering. */
    public readonly shopId: number,

    /** Denormalized shop name to avoid cross-context joins. */
    public shopName: string,

    /** Determines tracking path: pickup counter vs hostel delivery. */
    public readonly deliveryType: 'pickup' | 'hostel',

    /** Denormalized hostel address for hostel orders. */
    public hostelAddress: string | null,

    /** Base order price (paise). */
    public totalPrice: number,

    // ── Payment ─────────────────────────────────────────────────────────────

    /** Current payment status from the Payment bounded context. */
    public paymentStatus: string,

    /** Invoice number generated after payment capture. */
    public invoiceNumber: string | null,

    // ── Print Production ─────────────────────────────────────────────────────

    /** FK to print_jobs on the write side. */
    public printJobId: number | null,

    /** Current print job status string from the Print Production BC. */
    public printStatus: string | null,

    // ── Fulfillment ──────────────────────────────────────────────────────────

    /** FK to fulfillments on the write side. */
    public fulfillmentId: number | null,

    /** Current fulfillment status string from the Fulfillment BC. */
    public fulfillmentStatus: string | null,

    // ── Delivery ─────────────────────────────────────────────────────────────

    /** Assigned delivery agent. */
    public assignedAgentId: number | null,

    /** Denormalized agent name. */
    public agentName: string | null,

    /** Denormalized agent phone for customer contact. */
    public agentPhone: string | null,

    // ── Projection Metadata ──────────────────────────────────────────────────

    /**
     * Derived customer-facing lifecycle state.
     * Computed exclusively by LifecycleStateMapper.
     */
    public currentState: LifecycleState,

    /**
     * Version counter of the last successfully processed event payload.
     * Used for stale-event detection per RFC-007 §17.
     */
    public lastProcessedVersion: number,

    /**
     * occurredAt timestamp of the last successfully processed event.
     * Used for stale-event detection per RFC-007 §17.
     */
    public lastProcessedOccurredAt: Date,

    /**
     * Optimistic concurrency token per RFC-007 §21.
     * Incremented on every successful update.
     */
    public version: number,

    // ── Audit ────────────────────────────────────────────────────────────────

    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Factory method to create a new projection from the ORDER_FINALIZED event.
   * Starts at LifecycleState.CONFIRMED because payment has already been captured.
   */
  public static createFromOrderFinalized(params: {
    orderId: number;
    orderHash: string;
    studentId: number;
    shopId: number;
    shopName: string;
    deliveryType: 'pickup' | 'hostel';
    hostelAddress: string | null;
    totalPrice: number;
    paymentStatus: string;
    invoiceNumber: string | null;
    eventVersion: number;
    occurredAt: Date;
  }): OrderLifecycleProjection {
    const now = new Date();
    return new OrderLifecycleProjection(
      params.orderId,
      params.orderHash,
      params.studentId,
      params.shopId,
      params.shopName,
      params.deliveryType,
      params.hostelAddress,
      params.totalPrice,
      params.paymentStatus,
      params.invoiceNumber,
      null,   // printJobId
      null,   // printStatus
      null,   // fulfillmentId
      null,   // fulfillmentStatus
      null,   // assignedAgentId
      null,   // agentName
      null,   // agentPhone
      LifecycleState.CONFIRMED,
      params.eventVersion,
      params.occurredAt,
      1,      // version starts at 1
      now,
      now,
    );
  }
}
