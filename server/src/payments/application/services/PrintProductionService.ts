import { IPrintProductionService } from './IPrintProductionService';
import { IPrintJobRepository } from '../../interfaces/IPrintJobRepository';
import { IPrintJobHistoryRepository } from '../../interfaces/IPrintJobHistoryRepository';
import { IPrintJobAuthorizationService } from './IPrintJobAuthorizationService';
import { IOutboxRepository } from '../../interfaces/IOutboxRepository';
import { PrintJobResponseDTO } from '../dtos/PrintJobResponseDTO';
import { TransitionPrintJobDTO } from '../dtos/TransitionPrintJobDTO';
import { UpdatePrintJobSchedulingDTO } from '../dtos/UpdatePrintJobSchedulingDTO';
import { PrintJobHistory } from '../../domain/entities/PrintJobHistory';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { OutboxEventStatus } from '../../domain/enums/OutboxEventStatus';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { PrintJob } from '../../domain/entities/PrintJob';
import db from '../../../config/database';
import crypto from 'crypto';

export class PrintProductionService implements IPrintProductionService {
  constructor(
    private readonly printJobRepository: IPrintJobRepository,
    private readonly printJobHistoryRepository: IPrintJobHistoryRepository,
    private readonly authorizationService: IPrintJobAuthorizationService,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  private mapToDTO(printJob: PrintJob): PrintJobResponseDTO {
    return {
      id: printJob.id,
      orderId: printJob.orderId,
      shopId: printJob.shopId,
      studentId: printJob.studentId,
      status: printJob.status,
      priority: printJob.priority,
      version: printJob.version,
      lastStatusChangedAt: printJob.lastStatusChangedAt ? printJob.lastStatusChangedAt.toISOString() : null,
      acceptedAt: printJob.acceptedAt ? printJob.acceptedAt.toISOString() : null,
      printingStartedAt: printJob.printingStartedAt ? printJob.printingStartedAt.toISOString() : null,
      readyAt: printJob.readyAt ? printJob.readyAt.toISOString() : null,
      cancelledAt: printJob.cancelledAt ? printJob.cancelledAt.toISOString() : null,
      completedAt: printJob.completedAt ? printJob.completedAt.toISOString() : null,
      cancellationReasonCode: printJob.cancellationReasonCode || null,
      cancellationDescription: printJob.cancellationDescription || null,
      estimatedCompletionAt: printJob.estimatedCompletionAt ? printJob.estimatedCompletionAt.toISOString() : null,
      createdAt: printJob.createdAt.toISOString(),
      updatedAt: printJob.updatedAt.toISOString()
    };
  }

  private async logHistory(
    printJob: PrintJob,
    previousStatus: string,
    actorType: 'student' | 'shop' | 'system',
    transitionName: 'ACCEPT' | 'START_PRINTING' | 'MARK_READY' | 'CANCEL',
    changedByUserId: number,
    reasonCode: string | null,
    reasonDescription: string | null,
    correlationId: CorrelationId,
    connection: any
  ): Promise<void> {
    const history = new PrintJobHistory(
      null,
      printJob.id,
      previousStatus,
      printJob.status,
      actorType,
      transitionName,
      changedByUserId,
      reasonCode,
      reasonDescription,
      correlationId.value
    );
    await this.printJobHistoryRepository.create(history, connection);
  }

  private async stageEvents(printJob: PrintJob, correlationId: CorrelationId, connection: any): Promise<void> {
    for (const event of printJob.domainEvents) {
      const outboxEvent = new OutboxEvent(
        null,
        crypto.randomUUID(),
        event.eventName,
        'PRINT_JOB',
        printJob.id.toString(),
        JSON.stringify({
          ...event.payload,
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
    printJob.domainEvents = []; // clear internal domain events
  }

  public async acceptJob(printJobId: number, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await this.authorizationService.assertShopAccess(printJobId, userId, conn);
      const printJob = await this.printJobRepository.findByIdForUpdate(printJobId, conn);
      if (!printJob) throw new Error('Print job not found');

      const prevStatus = printJob.status;
      printJob.accept();

      await this.printJobRepository.update(printJob, conn);
      await this.logHistory(printJob, prevStatus, 'shop', 'ACCEPT', userId, null, null, cid, conn);
      await this.stageEvents(printJob, cid, conn);

      await conn.commit();
      return this.mapToDTO(printJob);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async startPrinting(printJobId: number, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await this.authorizationService.assertShopAccess(printJobId, userId, conn);
      const printJob = await this.printJobRepository.findByIdForUpdate(printJobId, conn);
      if (!printJob) throw new Error('Print job not found');

      const prevStatus = printJob.status;
      printJob.startPrinting();

      await this.printJobRepository.update(printJob, conn);
      await this.logHistory(printJob, prevStatus, 'shop', 'START_PRINTING', userId, null, null, cid, conn);
      await this.stageEvents(printJob, cid, conn);

      await conn.commit();
      return this.mapToDTO(printJob);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async markJobReady(printJobId: number, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await this.authorizationService.assertShopAccess(printJobId, userId, conn);
      const printJob = await this.printJobRepository.findByIdForUpdate(printJobId, conn);
      if (!printJob) throw new Error('Print job not found');

      const prevStatus = printJob.status;
      printJob.markReady();

      await this.printJobRepository.update(printJob, conn);
      await this.logHistory(printJob, prevStatus, 'shop', 'MARK_READY', userId, null, null, cid, conn);
      await this.stageEvents(printJob, cid, conn);

      await conn.commit();
      return this.mapToDTO(printJob);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async cancelJob(dto: TransitionPrintJobDTO, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const actorType = await this.authorizationService.assertUserAccess(dto.printJobId, userId, conn);
      const printJob = await this.printJobRepository.findByIdForUpdate(dto.printJobId, conn);
      if (!printJob) throw new Error('Print job not found');

      const prevStatus = printJob.status;
      if (!dto.reasonCode) {
        throw new Error('Cancellation reason code is required');
      }

      printJob.cancel(actorType, dto.reasonCode, dto.reasonDescription || null);

      await this.printJobRepository.update(printJob, conn);
      await this.logHistory(printJob, prevStatus, actorType, 'CANCEL', userId, dto.reasonCode, dto.reasonDescription || null, cid, conn);
      await this.stageEvents(printJob, cid, conn);

      await conn.commit();
      return this.mapToDTO(printJob);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  public async updateScheduling(dto: UpdatePrintJobSchedulingDTO, userId: number, correlationId?: CorrelationId): Promise<PrintJobResponseDTO> {
    const cid = correlationId || CorrelationId.create();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await this.authorizationService.assertShopAccess(dto.printJobId, userId, conn);
      const printJob = await this.printJobRepository.findByIdForUpdate(dto.printJobId, conn);
      if (!printJob) throw new Error('Print job not found');

      printJob.updateScheduling(dto.priority, dto.estimatedCompletionAt);

      await this.printJobRepository.update(printJob, conn);

      await conn.commit();
      return this.mapToDTO(printJob);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
