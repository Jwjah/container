import { LifecycleState } from '../domain/enums/LifecycleState';
import { UnsupportedLifecycleEventError } from '../domain/errors/TrackingErrors';

export class LifecycleStateMapper {
  /**
   * Translates write-side domain event types into read-side unified LifecycleState enums.
   *
   * RFC-007 §10 & Phase 7C Final Implementation Specification.
   */
  public static map(eventType: string): LifecycleState {
    switch (eventType) {
      case 'ORDER_CREATED':
        return LifecycleState.PENDING_PAYMENT;

      case 'ORDER_FINALIZED':
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_SUCCESSFUL':
        return LifecycleState.CONFIRMED;

      case 'PRINT_JOB_ACCEPTED':
      case 'PRINT_STARTED':
      case 'PRINT_JOB_CREATED':
        return LifecycleState.IN_PRODUCTION;

      case 'PRINT_READY':
      case 'PRINT_COMPLETED':
        return LifecycleState.READY_FOR_PICKUP;

      case 'DELIVERY_AGENT_ASSIGNED':
      case 'OUT_FOR_DELIVERY':
        return LifecycleState.OUT_FOR_DELIVERY;

      case 'DELIVERY_COMPLETED':
      case 'ORDER_COMPLETED':
        return LifecycleState.DELIVERED;

      default:
        throw new UnsupportedLifecycleEventError(eventType);
    }
  }
}
