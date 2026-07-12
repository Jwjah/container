import { FulfillmentStatus } from '../enums/FulfillmentStatus';
import { FulfillmentMode } from '../enums/FulfillmentMode';
import { FulfillmentFailureReason } from '../enums/FulfillmentFailureReason';
import { DomainEvent } from '../events/DomainEvent';

export class Fulfillment {
  public domainEvents: DomainEvent[] = [];

  constructor(
    public readonly id: number,
    public readonly orderId: number,
    public readonly printJobId: number,
    public readonly shopId: number,
    public readonly studentId: number,
    public status: FulfillmentStatus,
    public mode: FulfillmentMode,
    public assignedAgentId: number | null,
    public otpHash: string | null,
    public otpExpiresAt: Date | null,
    public otpAttempts: number,
    public deliveryAttempts: number,
    public proofOfDeliveryReference: string | null,
    public failureReason: FulfillmentFailureReason | null,
    public estimatedDeliveryAt: Date | null,
    public actualDeliveryAt: Date | null,
    public otpVerifiedAt: Date | null,
    public version: number,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  public static create(
    orderId: number,
    printJobId: number,
    shopId: number,
    studentId: number,
    mode: FulfillmentMode
  ): Fulfillment {
    const now = new Date();
    const fulfillment = new Fulfillment(
      0, // DB auto-assigned
      orderId,
      printJobId,
      shopId,
      studentId,
      FulfillmentStatus.READY,
      mode,
      null, // assignedAgentId
      null, // otpHash
      null, // otpExpiresAt
      0, // otpAttempts
      0, // deliveryAttempts
      null, // proofOfDeliveryReference
      null, // failureReason
      null, // estimatedDeliveryAt
      null, // actualDeliveryAt
      null, // otpVerifiedAt
      1, // version
      now,
      now
    );

    fulfillment.domainEvents.push({
      eventName: 'FULFILLMENT_CREATED',
      payload: {
        fulfillmentId: fulfillment.id,
        orderId,
        printJobId,
        shopId,
        studentId,
        mode
      }
    });

    return fulfillment;
  }

  public assignAgent(agentId: number, otpHash: string | null, expiresAt: Date | null): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.READY, 'assignAgent');
    if (this.mode !== FulfillmentMode.DELIVERY) {
      throw new Error('Cannot assign agent for PICKUP mode fulfillment');
    }

    const now = new Date();
    this.assignedAgentId = agentId;
    this.otpHash = otpHash;
    this.otpExpiresAt = expiresAt;
    this.otpAttempts = 0;
    this.otpVerifiedAt = null;
    this.status = FulfillmentStatus.DELIVERY_ASSIGNED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'FULFILLMENT_ASSIGNED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId,
        assignedAgentId: agentId
      }
    });
  }

  public reassignAgent(agentId: number, otpHash: string | null, expiresAt: Date | null): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.DELIVERY_ASSIGNED, 'reassignAgent');
    if (this.mode !== FulfillmentMode.DELIVERY) {
      throw new Error('Cannot assign agent for PICKUP mode fulfillment');
    }

    const now = new Date();
    this.assignedAgentId = agentId;
    this.otpHash = otpHash;
    this.otpExpiresAt = expiresAt;
    this.otpAttempts = 0;
    this.otpVerifiedAt = null;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'FULFILLMENT_ASSIGNED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId,
        assignedAgentId: agentId
      }
    });
  }

  public rejectAgent(): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.DELIVERY_ASSIGNED, 'rejectAgent');

    const now = new Date();
    this.assignedAgentId = null;
    this.otpHash = null;
    this.otpExpiresAt = null;
    this.otpAttempts = 0;
    this.otpVerifiedAt = null;
    this.status = FulfillmentStatus.READY;
    this.updatedAt = now;
  }

  public startDelivery(): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.DELIVERY_ASSIGNED, 'startDelivery');

    const now = new Date();
    this.deliveryAttempts += 1;
    this.status = FulfillmentStatus.OUT_FOR_DELIVERY;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'FULFILLMENT_STARTED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId
      }
    });
  }

  public verifyOtp(isValid: boolean): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.OUT_FOR_DELIVERY, 'verifyOtp');

    if (this.otpExpiresAt && new Date() > this.otpExpiresAt) {
      throw new Error('OTP has expired');
    }

    if (this.otpAttempts >= 3) {
      throw new Error('Brute-force lockout: maximum OTP attempts exceeded');
    }

    const now = new Date();
    if (!isValid) {
      this.otpAttempts += 1;
      this.updatedAt = now;
      throw new Error('Invalid OTP');
    }

    this.otpVerifiedAt = now;
    this.otpAttempts = 0;
    this.updatedAt = now;
  }

  public completeDelivery(proofReference: string): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.OUT_FOR_DELIVERY, 'completeDelivery');

    if (!this.otpVerifiedAt) {
      throw new Error('OTP verification required before delivery completion');
    }

    const now = new Date();
    this.proofOfDeliveryReference = proofReference;
    this.actualDeliveryAt = now;
    this.status = FulfillmentStatus.DELIVERED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_COMPLETED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId,
        proofOfDeliveryReference: proofReference
      }
    });
  }

  public completePickup(): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.READY, 'completePickup');
    if (this.mode !== FulfillmentMode.PICKUP) {
      throw new Error('Cannot complete pickup for DELIVERY mode fulfillment');
    }

    const now = new Date();
    this.actualDeliveryAt = now;
    this.status = FulfillmentStatus.PICKUP_COMPLETED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'PICKUP_COMPLETED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId
      }
    });
  }

  public failDelivery(reason: FulfillmentFailureReason): void {
    this.assertNotTerminal();
    this.assertStatus(FulfillmentStatus.OUT_FOR_DELIVERY, 'failDelivery');

    const now = new Date();
    this.failureReason = reason;
    this.status = FulfillmentStatus.FAILED;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'DELIVERY_FAILED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId,
        reason
      }
    });
  }

  public regenerateOtp(otpHash: string, expiresAt: Date): void {
    this.assertNotTerminal();
    if (
      this.status !== FulfillmentStatus.DELIVERY_ASSIGNED &&
      this.status !== FulfillmentStatus.OUT_FOR_DELIVERY
    ) {
      throw new Error(
        `OTP regeneration forbidden: can only regenerate OTP in DELIVERY_ASSIGNED or OUT_FOR_DELIVERY status. Current status is ${this.status}.`
      );
    }

    const now = new Date();
    this.otpHash = otpHash;
    this.otpExpiresAt = expiresAt;
    this.otpAttempts = 0;
    this.otpVerifiedAt = null;
    this.updatedAt = now;

    this.domainEvents.push({
      eventName: 'OTP_REGENERATED',
      payload: {
        fulfillmentId: this.id,
        orderId: this.orderId,
        printJobId: this.printJobId,
        shopId: this.shopId,
        studentId: this.studentId
      }
    });
  }

  private assertNotTerminal(): void {
    if (
      this.status === FulfillmentStatus.DELIVERED ||
      this.status === FulfillmentStatus.PICKUP_COMPLETED ||
      this.status === FulfillmentStatus.FAILED
    ) {
      throw new Error(`Cannot transition fulfillment from terminal status: ${this.status}`);
    }
  }

  private assertStatus(expected: FulfillmentStatus, action: string): void {
    if (this.status !== expected) {
      throw new Error(
        `Cannot perform '${action}' action: expected status to be ${expected}, but got ${this.status}`
      );
    }
  }
}
