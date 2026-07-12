import { IFulfillmentRepository } from '../../interfaces/IFulfillmentRepository';
import { IFulfillmentHistoryRepository } from '../../interfaces/IFulfillmentHistoryRepository';
import { IOrderRepository } from '../../interfaces/IOrderRepository';
import { IPrintJobRepository } from '../../interfaces/IPrintJobRepository';
import { IOutboxRepository } from '../../interfaces/IOutboxRepository';
import { OtpService } from './OtpService';
import { FulfillmentAuthorizationService } from './FulfillmentAuthorizationService';
import { Fulfillment } from '../../domain/entities/Fulfillment';
import { FulfillmentHistory } from '../../domain/entities/FulfillmentHistory';
import { FulfillmentMode } from '../../domain/enums/FulfillmentMode';
import { FulfillmentStatus } from '../../domain/enums/FulfillmentStatus';
import { FulfillmentTransition } from '../../domain/enums/FulfillmentTransition';
import { FulfillmentFailureReason } from '../../domain/enums/FulfillmentFailureReason';
import { FulfillmentResponseDTO } from '../dtos/FulfillmentResponseDTO';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { OutboxEventStatus } from '../../domain/enums/OutboxEventStatus';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import db from '../../../config/database';
import crypto from 'crypto';

export class FulfillmentService {
  constructor(
    private readonly fulfillmentRepository: IFulfillmentRepository,
    private readonly fulfillmentHistoryRepository: IFulfillmentHistoryRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly printJobRepository: IPrintJobRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly otpService: OtpService,
    private readonly authorizationService: FulfillmentAuthorizationService
  ) {}

  private mapToDTO(f: Fulfillment): FulfillmentResponseDTO {
    return {
      id: f.id,
      orderId: f.orderId,
      printJobId: f.printJobId,
      shopId: f.shopId,
      studentId: f.studentId,
      status: f.status,
      mode: f.mode,
      assignedAgentId: f.assignedAgentId,
      otpExpiresAt: f.otpExpiresAt ? f.otpExpiresAt.toISOString() : null,
      otpAttempts: f.otpAttempts,
      deliveryAttempts: f.deliveryAttempts,
      proofOfDeliveryReference: f.proofOfDeliveryReference,
      failureReason: f.failureReason || null,
      estimatedDeliveryAt: f.estimatedDeliveryAt ? f.estimatedDeliveryAt.toISOString() : null,
      actualDeliveryAt: f.actualDeliveryAt ? f.actualDeliveryAt.toISOString() : null,
      otpVerifiedAt: f.otpVerifiedAt ? f.otpVerifiedAt.toISOString() : null,
      version: f.version,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString()
    };
  }

  private async getUserRole(userId: number, connection: any): Promise<string> {
    const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows && rows.length > 0 ? rows[0].role : 'system';
  }

  private async logHistory(
    fulfillment: Fulfillment,
    previousStatus: string,
    transitionName: FulfillmentTransition,
    performedByUserId: number,
    correlationId: CorrelationId,
    connection: any,
    metadata: any = null
  ): Promise<void> {
    const performedByType = await this.getUserRole(performedByUserId, connection);
    const history = new FulfillmentHistory(
      null,
      fulfillment.id,
      previousStatus,
      fulfillment.status,
      transitionName,
      performedByType,
      performedByUserId,
      fulfillment.failureReason,
      fulfillment.proofOfDeliveryReference,
      metadata,
      correlationId.value
    );
    await this.fulfillmentHistoryRepository.create(history, connection);
  }

  private async stageEvents(
    fulfillment: Fulfillment,
    correlationId: CorrelationId,
    connection: any,
    extraPayloadFields: any = {}
  ): Promise<void> {
    for (const event of fulfillment.domainEvents) {
      const outboxEvent = new OutboxEvent(
        null,
        crypto.randomUUID(),
        event.eventName,
        'FULFILLMENT',
        fulfillment.id.toString(),
        JSON.stringify({
          ...event.payload,
          ...extraPayloadFields,
          eventVersion: 1,
          occurredAt: new Date().toISOString(),
          correlationId: correlationId.value,
          causationId: correlationId.value
        }),
        OutboxEventStatus.PENDING,
        0,
        null,
        correlationId.value,
        1,
        new Date()
      );
      await this.outboxRepository.create(outboxEvent, connection);
    }
    fulfillment.domainEvents = []; // Clear staged events
  }

  private async lockAll(
    orderId: number,
    printJobId: number,
    fulfillmentId: number | null,
    connection: any
  ): Promise<Fulfillment | null> {
    // Acquire locks in Order -> PrintJob -> Fulfillment order to prevent deadlocks
    const order = await this.orderRepository.findByIdForUpdate(orderId, connection);
    if (!order) {
      throw new Error('Order not found');
    }

    const printJob = await this.printJobRepository.findByIdForUpdate(printJobId, connection);
    if (!printJob) {
      throw new Error('Print job not found');
    }

    if (fulfillmentId !== null) {
      const fulfillment = await this.fulfillmentRepository.findByIdForUpdate(fulfillmentId, connection);
      if (!fulfillment) {
        throw new Error('Fulfillment not found');
      }
      return fulfillment;
    }

    return null;
  }

  public async initializeFromPrintReady(
    orderId: number,
    shopId: number,
    studentId: number,
    printJobId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // Acquire locks
      await this.lockAll(orderId, printJobId, null, conn);

      // Idempotency check: if fulfillment already exists, return it
      const existing = await this.fulfillmentRepository.findByOrderId(orderId, conn);
      if (existing) {
        await conn.commit();
        return this.mapToDTO(existing);
      }

      // Check order to resolve mode
      const [orderRows] = await conn.execute('SELECT delivery_type FROM orders WHERE id = ?', [orderId]);
      if (!orderRows || orderRows.length === 0) {
        throw new Error('Order not found');
      }
      const deliveryType = orderRows[0].delivery_type || 'pickup';
      const resolvedMode = deliveryType === 'hostel' ? FulfillmentMode.DELIVERY : FulfillmentMode.PICKUP;

      const f = Fulfillment.create(orderId, printJobId, shopId, studentId, resolvedMode);
      const saved = await this.fulfillmentRepository.create(f, conn);

      await this.logHistory(saved, 'NONE', FulfillmentTransition.INITIALIZED, studentId, cid, conn);
      await this.stageEvents(saved, cid, conn);

      await conn.commit();
      return this.mapToDTO(saved);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async assignAgent(
    fulfillmentId: number,
    agentId: number,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanAssignAgent(f, userId, conn);

      // Verify that agentId exists and has the agent role
      const [agentRows] = await conn.execute('SELECT role FROM users WHERE id = ?', [agentId]);
      if (!agentRows || agentRows.length === 0 || agentRows[0].role !== 'agent') {
        throw new Error('Invalid agent: User must exist and have the agent role');
      }

      const rawOtp = this.otpService.generateOtp();
      const otpHash = this.otpService.hashOtp(rawOtp);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      const prevStatus = f.status;
      f.assignAgent(agentId, otpHash, expiresAt);

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.ASSIGN_AGENT, userId, cid, conn, { agentId });
      // Stage the FULFILLMENT_ASSIGNED outbox event, putting rawOtp in outbox event payload
      await this.stageEvents(f, cid, conn, { rawOtp });

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async startDelivery(
    fulfillmentId: number,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanStartDelivery(f, userId, conn);

      const prevStatus = f.status;
      f.startDelivery();

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.START_DELIVERY, userId, cid, conn);
      await this.stageEvents(f, cid, conn);

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async verifyOtp(
    fulfillmentId: number,
    rawOtp: string,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanVerifyOtp(f, userId, conn);

      let verificationError: Error | null = null;
      const prevStatus = f.status;

      try {
        if (!f.otpHash) {
          throw new Error('No OTP is active for this fulfillment');
        }
        const isValid = this.otpService.compareOtp(rawOtp, f.otpHash);
        f.verifyOtp(isValid);
      } catch (err: any) {
        verificationError = err;
      }

      // Persist the state (even if OTP failed, so we save otpAttempts/lockout)
      await this.fulfillmentRepository.update(f, conn);

      if (verificationError) {
        // Commit the incremented attempts to DB, then throw verification exception
        await conn.commit();
        throw verificationError;
      }

      // Success verifyOtp: log to history and commit
      await this.logHistory(f, prevStatus, FulfillmentTransition.VERIFY_OTP, userId, cid, conn);
      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async completeDelivery(
    fulfillmentId: number,
    proofReference: string,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanCompleteDelivery(f, userId, conn);

      if (!proofReference || proofReference.trim() === '') {
        throw new Error('Proof of delivery reference is required');
      }

      const prevStatus = f.status;
      f.completeDelivery(proofReference);

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.COMPLETE_DELIVERY, userId, cid, conn, { proofReference });
      await this.stageEvents(f, cid, conn);

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async completePickup(
    fulfillmentId: number,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanCompletePickup(f, userId, conn);

      const prevStatus = f.status;
      f.completePickup();

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.COMPLETE_PICKUP, userId, cid, conn);
      await this.stageEvents(f, cid, conn);

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async failDelivery(
    fulfillmentId: number,
    reason: FulfillmentFailureReason,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanFailDelivery(f, userId, conn);

      const prevStatus = f.status;
      f.failDelivery(reason);

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.FAIL_DELIVERY, userId, cid, conn, { reason });
      await this.stageEvents(f, cid, conn);

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async regenerateOtp(
    fulfillmentId: number,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      await this.authorizationService.assertCanRegenerateOtp(f, userId, conn);

      const rawOtp = this.otpService.generateOtp();
      const otpHash = this.otpService.hashOtp(rawOtp);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      const prevStatus = f.status;
      f.regenerateOtp(otpHash, expiresAt);

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.REGENERATE_OTP, userId, cid, conn);
      // Stage event and put rawOtp in outbox payload
      await this.stageEvents(f, cid, conn, { rawOtp });

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async rejectAgent(
    fulfillmentId: number,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      // Verify that the assigned agent matches
      if (f.assignedAgentId !== userId) {
        throw new Error('Forbidden: Only the assigned agent can reject this fulfillment');
      }

      const prevStatus = f.status;
      f.rejectAgent();

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.REJECT_AGENT, userId, cid, conn);
      await this.stageEvents(f, cid, conn);

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async reassignAgent(
    fulfillmentId: number,
    agentId: number,
    userId: number,
    correlationId?: CorrelationId
  ): Promise<FulfillmentResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const f = await this.fulfillmentRepository.findById(fulfillmentId, conn);
      if (!f) throw new Error('Fulfillment not found');

      // Lock Order -> PrintJob -> Fulfillment
      await this.lockAll(f.orderId, f.printJobId, f.id, conn);

      // Authorize
      await this.authorizationService.assertCanAssignAgent(f, userId, conn);

      // Verify that agentId exists and has the agent role
      const [agentRows] = await conn.execute('SELECT role FROM users WHERE id = ?', [agentId]);
      if (!agentRows || agentRows.length === 0 || agentRows[0].role !== 'agent') {
        throw new Error('Invalid agent: User must exist and have the agent role');
      }

      // Generate new OTP
      const rawOtp = this.otpService.generateOtp();
      const otpHash = this.otpService.hashOtp(rawOtp);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

      const prevStatus = f.status;
      f.reassignAgent(agentId, otpHash, expiresAt);

      await this.fulfillmentRepository.update(f, conn);
      await this.logHistory(f, prevStatus, FulfillmentTransition.ASSIGN_AGENT, userId, cid, conn, { agentId });
      await this.stageEvents(f, cid, conn, { rawOtp });

      await conn.commit();
      return this.mapToDTO(f);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
