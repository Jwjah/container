/**
 * LifecycleState — the customer-facing unified order lifecycle states.
 *
 * RFC-007 §10 — Lifecycle States
 *
 * These states are DERIVED. They must NEVER be written directly by any caller.
 * All writes go through LifecycleStateMapper inside ProjectionUpdateService.
 */
export enum LifecycleState {
  /** Order registered; awaiting gateway payment confirmation. */
  PENDING_PAYMENT = 'PENDING_PAYMENT',

  /** Payment captured; queued for printing or awaiting agent assignment. */
  CONFIRMED = 'CONFIRMED',

  /** Print shop actively processing the job. */
  IN_PRODUCTION = 'IN_PRODUCTION',

  /** Package ready at shop counter; customer may collect. */
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',

  /** Package in transit with a delivery agent. */
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',

  /** Order successfully handed to customer (pickup or delivery). */
  DELIVERED = 'DELIVERED',

  /** Terminal — delivery failed after exhausting retries. */
  FAILED = 'FAILED',

  /** Terminal — print job or payment cancelled. */
  CANCELLED = 'CANCELLED',
}
