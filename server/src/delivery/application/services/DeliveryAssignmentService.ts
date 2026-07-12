import crypto from 'crypto';
import db from '../../../config/database';
import { IDeliveryAssignmentRepository } from '../../interfaces/IDeliveryAssignmentRepository';
import { IDeliveryHistoryRepository } from '../../interfaces/IDeliveryHistoryRepository';
import { IOutboxRepository } from '../../../payments/interfaces/IOutboxRepository';
import { AgentAvailabilityService } from './AgentAvailabilityService';
import { DeliveryAuthorizationService } from './DeliveryAuthorizationService';
import { DeliveryAssignment } from '../../domain/entities/DeliveryAssignment';
import { DeliveryHistory } from '../../domain/entities/DeliveryHistory';
import { DeliveryAssignmentStatus } from '../../domain/enums/DeliveryAssignmentStatus';
import { OutboxEvent } from '../../../payments/domain/entities/OutboxEvent';
import { OutboxEventStatus } from '../../../payments/domain/enums/OutboxEventStatus';

export class DeliveryAssignmentService {
  constructor(
    private readonly assignmentRepository: IDeliveryAssignmentRepository,
    private readonly historyRepository: IDeliveryHistoryRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly availabilityService: AgentAvailabilityService,
    private readonly authorizationService: DeliveryAuthorizationService
  ) {}

  private async lockAll(
    orderId: number,
    printJobId: number,
    fulfillmentId: number,
    agentId: number | null,
    assignmentId: number | null,
    connection: any
  ): Promise<void> {
    const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
    const forUpdate = isSQLite ? '' : ' FOR UPDATE';

    // 1. Lock Order
    await connection.execute(`SELECT id FROM orders WHERE id = ?${forUpdate}`, [orderId]);
    // 2. Lock PrintJob
    await connection.execute(`SELECT id FROM print_jobs WHERE id = ?${forUpdate}`, [printJobId]);
    // 3. Lock Fulfillment
    await connection.execute(`SELECT id FROM fulfillments WHERE id = ?${forUpdate}`, [fulfillmentId]);
    
    // 4. Lock DeliveryAssignment
    if (assignmentId !== null) {
      await connection.execute(`SELECT id FROM delivery_assignments WHERE id = ?${forUpdate}`, [assignmentId]);
    }
    // 5. Lock Agent Availability
    if (agentId !== null) {
      await connection.execute(`SELECT agent_id FROM delivery_agent_availability WHERE agent_id = ?${forUpdate}`, [agentId]);
    }
  }

  private async stageEvents(
    assignment: DeliveryAssignment,
    correlationId: string,
    connection: any
  ): Promise<void> {
    for (const event of assignment.domainEvents) {
      const outboxEvent = new OutboxEvent(
        null,
        crypto.randomUUID(),
        event.eventName,
        'DELIVERY_ASSIGNMENT',
        assignment.id.toString(),
        JSON.stringify({
          ...event.payload,
          eventVersion: 1,
          occurredAt: new Date().toISOString(),
          correlationId: correlationId,
          causationId: correlationId
        }),
        OutboxEventStatus.PENDING,
        0,
        null,
        correlationId,
        1,
        new Date()
      );
      await this.outboxRepository.create(outboxEvent, connection);
    }
    assignment.domainEvents = [];
  }

  private async logHistory(
    assignment: DeliveryAssignment,
    prevStatus: string,
    transitionName: string,
    performedByUserId: number,
    correlationId: string,
    connection: any,
    metadata: any = null
  ): Promise<void> {
    let performedByType = 'system';
    if (performedByUserId !== 0) {
      const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [performedByUserId]);
      if (rows && rows.length > 0) {
        performedByType = rows[0].role;
      }
    }

    const history = new DeliveryHistory(
      null,
      assignment.id,
      prevStatus,
      assignment.status,
      transitionName,
      performedByUserId,
      performedByType,
      metadata,
      correlationId
    );
    await this.historyRepository.create(history, connection);
  }

  public async createAssignment(
    fulfillmentId: number,
    orderId: number,
    shopId: number,
    studentId: number,
    agentId: number,
    printJobId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Acquire parent locks and agent availability lock
      await this.lockAll(orderId, printJobId, fulfillmentId, agentId, null, conn);

      // Check for active assignment idempotency
      const existing = await this.assignmentRepository.findActiveByFulfillmentId(fulfillmentId, conn);
      if (existing) {
        // If agent matches, return existing assignment
        if (existing.agentId === agentId) {
          await conn.commit();
          return existing;
        }
        // Otherwise, throw error (or reassign using reassignment use case)
        throw new Error(`Active delivery assignment already exists for fulfillment #${fulfillmentId}`);
      }

      // Initialize/ensure agent availability record exists
      await this.availabilityService.getOrCreateAgentAvailability(agentId, conn);
      
      // Update agent availability state to BUSY
      await this.availabilityService.assignAgent(agentId, conn);

      // Create new assignment
      const a = DeliveryAssignment.create(
        fulfillmentId,
        orderId,
        shopId,
        studentId,
        agentId,
        correlationId
      );

      const saved = await this.assignmentRepository.create(a, conn);

      // Log history
      await this.logHistory(saved, 'NONE', 'ASSIGN', 0, correlationId, conn);

      // Stage events
      await this.stageEvents(saved, correlationId, conn);

      await conn.commit();
      return saved;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  public async acceptAssignment(
    assignmentId: number,
    userId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const a = await this.assignmentRepository.findById(assignmentId, conn);
      if (!a) throw new Error(`Delivery assignment not found: #${assignmentId}`);

      // Lock everything
      await this.lockAll(a.orderId, a.fulfillmentId, a.fulfillmentId, a.agentId, a.id, conn);

      // Authorize
      await this.authorizationService.assertCanAcceptOrRejectOrUpdate(a, userId, conn);

      const prevStatus = a.status;
      a.accept();
      a.correlationId = correlationId;

      await this.assignmentRepository.update(a, conn);

      await this.logHistory(a, prevStatus, 'ACCEPT', userId, correlationId, conn);
      await this.stageEvents(a, correlationId, conn);

      await conn.commit();
      return a;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  public async rejectAssignment(
    assignmentId: number,
    userId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const a = await this.assignmentRepository.findById(assignmentId, conn);
      if (!a) throw new Error(`Delivery assignment not found: #${assignmentId}`);

      // Lock everything
      await this.lockAll(a.orderId, a.fulfillmentId, a.fulfillmentId, a.agentId, a.id, conn);

      // Authorize
      await this.authorizationService.assertCanAcceptOrRejectOrUpdate(a, userId, conn);

      const prevStatus = a.status;
      a.reject();
      a.correlationId = correlationId;

      await this.assignmentRepository.update(a, conn);

      // Release agent status back to AVAILABLE
      await this.availabilityService.releaseAgent(a.agentId, conn);

      await this.logHistory(a, prevStatus, 'REJECT', userId, correlationId, conn);
      await this.stageEvents(a, correlationId, conn);

      await conn.commit();
      return a;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  public async pickupDelivery(
    assignmentId: number,
    userId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const a = await this.assignmentRepository.findById(assignmentId, conn);
      if (!a) throw new Error(`Delivery assignment not found: #${assignmentId}`);

      // Lock everything
      await this.lockAll(a.orderId, a.fulfillmentId, a.fulfillmentId, a.agentId, a.id, conn);

      // Authorize
      await this.authorizationService.assertCanAcceptOrRejectOrUpdate(a, userId, conn);

      const prevStatus = a.status;
      a.pickup();
      a.correlationId = correlationId;

      await this.assignmentRepository.update(a, conn);

      await this.logHistory(a, prevStatus, 'START_PICKUP', userId, correlationId, conn);
      await this.stageEvents(a, correlationId, conn);

      await conn.commit();
      return a;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  public async completeDelivery(
    assignmentId: number,
    proofReference: string,
    userId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const a = await this.assignmentRepository.findById(assignmentId, conn);
      if (!a) throw new Error(`Delivery assignment not found: #${assignmentId}`);

      // Lock everything
      await this.lockAll(a.orderId, a.fulfillmentId, a.fulfillmentId, a.agentId, a.id, conn);

      // Authorize
      await this.authorizationService.assertCanAcceptOrRejectOrUpdate(a, userId, conn);

      const prevStatus = a.status;
      a.complete();
      a.correlationId = correlationId;

      await this.assignmentRepository.update(a, conn);

      // Release agent status back to AVAILABLE
      await this.availabilityService.releaseAgent(a.agentId, conn);

      await this.logHistory(a, prevStatus, 'COMPLETE_DELIVERY', userId, correlationId, conn, { proofReference });
      await this.stageEvents(a, correlationId, conn);

      await conn.commit();
      return a;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  public async failDelivery(
    assignmentId: number,
    reason: string,
    userId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const a = await this.assignmentRepository.findById(assignmentId, conn);
      if (!a) throw new Error(`Delivery assignment not found: #${assignmentId}`);

      // Lock everything
      await this.lockAll(a.orderId, a.fulfillmentId, a.fulfillmentId, a.agentId, a.id, conn);

      // Authorize: agent or admin
      await this.authorizationService.assertCanAcceptOrRejectOrUpdate(a, userId, conn);

      const prevStatus = a.status;
      a.fail();
      a.correlationId = correlationId;

      await this.assignmentRepository.update(a, conn);

      // Release agent status back to AVAILABLE
      await this.availabilityService.releaseAgent(a.agentId, conn);

      await this.logHistory(a, prevStatus, 'FAIL_DELIVERY', userId, correlationId, conn, { reason });
      await this.stageEvents(a, correlationId, conn);

      await conn.commit();
      return a;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }

  public async reassignAgent(
    assignmentId: number,
    newAgentId: number,
    userId: number,
    correlationId: string
  ): Promise<DeliveryAssignment> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const a = await this.assignmentRepository.findById(assignmentId, conn);
      if (!a) throw new Error(`Delivery assignment not found: #${assignmentId}`);

      // Lock everything for the old assignment
      await this.lockAll(a.orderId, a.fulfillmentId, a.fulfillmentId, a.agentId, a.id, conn);

      const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
      const forUpdate = isSQLite ? '' : ' FOR UPDATE';
      // Lock the new agent availability
      await conn.execute(`SELECT agent_id FROM delivery_agent_availability WHERE agent_id = ?${forUpdate}`, [newAgentId]);

      // Authorize: Only shop manager or admin can assign
      await this.authorizationService.assertCanAssignOrReassign(a.shopId, userId, conn);

      // Must not be DELIVERED
      if (a.status === DeliveryAssignmentStatus.DELIVERED) {
        throw new Error('Cannot reassign completed delivery');
      }

      const prevStatus = a.status;
      const oldAgentId = a.agentId;

      // Update aggregate properties
      (a as any).agentId = newAgentId;
      a.status = DeliveryAssignmentStatus.ASSIGNED;
      a.correlationId = correlationId;

      await this.assignmentRepository.update(a, conn);

      // Release old agent
      await this.availabilityService.releaseAgent(oldAgentId, conn);

      // Assign new agent
      await this.availabilityService.getOrCreateAgentAvailability(newAgentId, conn);
      await this.availabilityService.assignAgent(newAgentId, conn);

      // Stage reassign events
      a.domainEvents.push({
        eventName: 'DELIVERY_AGENT_ASSIGNED',
        payload: {
          deliveryAssignmentId: a.id,
          fulfillmentId: a.fulfillmentId,
          orderId: a.orderId,
          shopId: a.shopId,
          studentId: a.studentId,
          agentId: newAgentId,
          correlationId
        }
      });

      await this.logHistory(a, prevStatus, 'REASSIGN', userId, correlationId, conn, { oldAgentId, newAgentId });
      await this.stageEvents(a, correlationId, conn);

      await conn.commit();
      return a;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      await conn.release();
    }
  }
}
