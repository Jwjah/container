import { PaymentStatus } from '../enums/PaymentStatus';
import { InvalidStateTransitionError } from '../errors/PaymentErrors';

export class PaymentStateMachine {
  // Define terminal states explicitly
  private static readonly TERMINAL_STATES: Set<PaymentStatus> = new Set([
    PaymentStatus.FAILED,
    PaymentStatus.VOIDED,
    PaymentStatus.REFUNDED
  ]);

  // Define allowed transitions map
  private static readonly ALLOWED_TRANSITIONS: Record<PaymentStatus, Set<PaymentStatus>> = {
    [PaymentStatus.CREATED]: new Set([
      PaymentStatus.INITIATED,
      PaymentStatus.FAILED,
      PaymentStatus.VOIDED
    ]),
    [PaymentStatus.INITIATED]: new Set([
      PaymentStatus.AUTHENTICATED,
      PaymentStatus.PENDING_VERIFICATION,
      PaymentStatus.CAPTURED,
      PaymentStatus.FAILED,
      PaymentStatus.VOIDED
    ]),
    [PaymentStatus.AUTHENTICATED]: new Set([
      PaymentStatus.PENDING_VERIFICATION,
      PaymentStatus.CAPTURED,
      PaymentStatus.FAILED,
      PaymentStatus.VOIDED
    ]),
    [PaymentStatus.PENDING_VERIFICATION]: new Set([
      PaymentStatus.CAPTURED,
      PaymentStatus.FAILED
    ]),
    [PaymentStatus.CAPTURED]: new Set([
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED
    ]),
    [PaymentStatus.PARTIALLY_REFUNDED]: new Set([
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED
    ]),
    // Terminal states cannot transition anywhere
    [PaymentStatus.FAILED]: new Set<PaymentStatus>(),
    [PaymentStatus.VOIDED]: new Set<PaymentStatus>(),
    [PaymentStatus.REFUNDED]: new Set<PaymentStatus>()
  };

  /**
   * Checks if a transition from one status to another is valid.
   */
  public static isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.has(to) : false;
  }

  /**
   * Verifies a transition. Throws InvalidStateTransitionError if the transition is invalid.
   */
  public static verifyTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (!this.isValidTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }

  /**
   * Checks if the given status is a terminal state.
   */
  public static isTerminalState(status: PaymentStatus): boolean {
    return this.TERMINAL_STATES.has(status);
  }
}
