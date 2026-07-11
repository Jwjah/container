import { Payment } from '../domain/entities/Payment';

export interface IPaymentRepository {
  /**
   * Creates a new Payment record in persistence.
   * Supports transaction propagation.
   */
  create(payment: Payment, connection?: any): Promise<Payment>;

  /**
   * Updates an existing Payment record in persistence.
   * Supports transaction propagation.
   */
  update(payment: Payment, connection?: any): Promise<Payment>;

  /**
   * Finds a Payment by its internal autoincrement ID.
   */
  findById(id: number, connection?: any): Promise<Payment | null>;

  /**
   * Finds a Payment by its external UUID.
   */
  findByUuid(uuid: string, connection?: any): Promise<Payment | null>;

  /**
   * Finds a Payment by its human-readable payment reference string.
   */
  findByReference(reference: string, connection?: any): Promise<Payment | null>;

  /**
   * Finds a Payment by the external gateway order/session ID.
   */
  findByGatewayOrderId(gatewayOrderId: string, connection?: any): Promise<Payment | null>;

  /**
   * Finds a Payment by the external gateway payment ID.
   */
  findByGatewayPaymentId(gatewayPaymentId: string, connection?: any): Promise<Payment | null>;

  /**
   * Finds a Payment by its idempotency key to prevent double submissions.
   */
  findByIdempotencyKey(idempotencyKey: string, connection?: any): Promise<Payment | null>;

  /**
   * Finds an active (non-terminal) Payment by order ID.
   */
  findActiveByOrderId(orderId: number, connection?: any): Promise<Payment | null>;
}
