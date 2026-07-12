import crypto from 'crypto';
import { Request, Response } from 'express';
import db from '../../../config/database';
import { DeliveryAssignmentService } from '../../application/services/DeliveryAssignmentService';
import { DeliveryDispatchService } from '../../application/services/DeliveryDispatchService';
import { IOutboxRepository } from '../../../payments/interfaces/IOutboxRepository';
import { mapDeliveryToDTO } from '../../application/dtos/DeliveryResponseDTO';
import { OutboxEvent } from '../../../payments/domain/entities/OutboxEvent';
import { OutboxEventStatus } from '../../../payments/domain/enums/OutboxEventStatus';

export class DeliveryController {
  constructor(
    private readonly assignmentService: DeliveryAssignmentService,
    private readonly dispatchService: DeliveryDispatchService,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  private getUserId(req: Request): number {
    const headerUserId = req.headers['x-user-id'];
    if (typeof headerUserId === 'string') {
      return parseInt(headerUserId) || 0;
    }
    if (Array.isArray(headerUserId) && headerUserId.length > 0) {
      return parseInt(headerUserId[0]) || 0;
    }
    return 0;
  }

  private getCorrelationId(req: Request): string {
    const headerCid = req.headers['x-correlation-id'];
    if (typeof headerCid === 'string') {
      return headerCid;
    }
    if (Array.isArray(headerCid) && headerCid.length > 0) {
      return headerCid[0];
    }
    return `cid-${Date.now()}`;
  }

  public async accept(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const assignment = await this.assignmentService.acceptAssignment(id, userId, cid);
      res.json(mapDeliveryToDTO(assignment));
    } catch (err: any) {
      if (err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  public async reject(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const assignment = await this.assignmentService.rejectAssignment(id, userId, cid);
      res.json(mapDeliveryToDTO(assignment));
    } catch (err: any) {
      if (err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  public async pickup(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const assignment = await this.assignmentService.pickupDelivery(id, userId, cid);
      res.json(mapDeliveryToDTO(assignment));
    } catch (err: any) {
      if (err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  public async complete(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const { proofReference } = req.body;
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const assignment = await this.assignmentService.completeDelivery(id, proofReference, userId, cid);
      res.json(mapDeliveryToDTO(assignment));
    } catch (err: any) {
      if (err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  public async fail(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const { reason } = req.body;
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const assignment = await this.assignmentService.failDelivery(id, reason, userId, cid);
      res.json(mapDeliveryToDTO(assignment));
    } catch (err: any) {
      if (err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  public async reassign(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const { agentId } = req.body;
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const assignment = await this.assignmentService.reassignAgent(id, agentId, userId, cid);
      res.json(mapDeliveryToDTO(assignment));
    } catch (err: any) {
      if (err.message.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  public async dispatch(req: Request, res: Response): Promise<void> {
    const { fulfillmentId } = req.body;
    const userId = this.getUserId(req);
    const cid = this.getCorrelationId(req);

    try {
      const agentId = await this.dispatchService.selectAgent();
      if (!agentId) {
        res.status(404).json({ error: 'No available delivery agents found' });
        return;
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
        const forUpdate = isSQLite ? '' : ' FOR UPDATE';
        await conn.execute(`SELECT id FROM fulfillments WHERE id = ?${forUpdate}`, [fulfillmentId]);

        const outboxEvent = new OutboxEvent(
          null,
          crypto.randomUUID(),
          'DELIVERY_DISPATCH_REQUESTED',
          'FULFILLMENT',
          fulfillmentId.toString(),
          JSON.stringify({
            fulfillmentId,
            agentId,
            userId,
            correlationId: cid
          }),
          OutboxEventStatus.PENDING,
          0,
          null,
          cid,
          1,
          new Date()
        );
        await this.outboxRepository.create(outboxEvent, conn);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        await conn.release();
      }

      res.json({ message: 'Dispatch requested successfully', agentId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
