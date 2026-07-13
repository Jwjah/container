import { IOrderLifecycleProjectionRepository } from '../interfaces/IOrderLifecycleProjectionRepository';
import { ITimelineEventRepository } from '../interfaces/ITimelineEventRepository';
import { IProcessedEventsRepository } from '../interfaces/IProcessedEventsRepository';
import { OrderLifecycleProjection } from '../domain/entities/OrderLifecycleProjection';
import { TimelineEvent } from '../domain/entities/TimelineEvent';
import { LifecycleState } from '../domain/enums/LifecycleState';
import { ActorType } from '../domain/enums/ActorType';
import { DomainEvent } from '../domain/events/DomainEvent';
import { InvalidLifecycleTransitionError, ProjectionConcurrencyError } from '../domain/errors/TrackingErrors';
import db from '../../config/database';

export class ProjectionUpdateService {
  constructor(
    private readonly projRepo: IOrderLifecycleProjectionRepository,
    private readonly timelineRepo: ITimelineEventRepository,
    private readonly processedEventsRepo: IProcessedEventsRepository
  ) {}

  /**
   * Orchestrates the creation of a new order tracking lifecycle projection.
   *
   * Coordinates:
   * 1. Transaction boundary.
   * 2. Idempotency marking via processed_events.
   * 3. Lifecycle projection creation.
   * 4. Timeline event append.
   *
   * RFC-007 §16 / §35 / §36 / §37
   */
  public async create(
    params: {
      projection: OrderLifecycleProjection;
      event: DomainEvent;
      title: string;
      description: string;
      actorType: ActorType;
      actorId: number | null;
      metadata?: Record<string, any>;
    },
    connection?: any
  ): Promise<void> {
    const runInTransaction = async (conn: any) => {
      // 1. Gaters idempotency — insertion is the source of truth
      const isUnique = await this.processedEventsRepo.markProcessed(params.event.eventId, conn);
      if (!isUnique) {
        console.log(`[ProjectionUpdateService.create] Duplicate event detected (eventId=${params.event.eventId}). Skipping.`);
        return;
      }

      // Check if projection already exists to avoid unexpected conflicts
      const exists = await this.projRepo.exists(params.projection.orderId, conn);
      if (exists) {
        console.log(`[ProjectionUpdateService.create] Projection for orderId=${params.projection.orderId} already exists. Skipping creation.`);
        return;
      }

      // 2. Persist the initial projection root
      await this.projRepo.create(params.projection, conn);

      // 3. Append the initial timeline event record
      const timelineEvent = new TimelineEvent(
        null,
        params.projection.orderId,
        params.event.eventId,
        params.event.eventType,
        params.projection.currentState,
        params.title,
        params.description,
        params.event.occurredAt,
        params.actorType,
        params.actorId,
        params.metadata || null,
        params.event.correlationId,
        params.event.causationId
      );
      await this.timelineRepo.append(timelineEvent, conn);
    };

    try {
      if (connection) {
        await runInTransaction(connection);
      } else {
        await db.transaction(async (conn) => {
          await runInTransaction(conn);
        });
      }
    } catch (err: any) {
      throw this.handleDatabaseError(err, params.projection.orderId);
    }
  }

  /**
   * Orchestrates transitioning an existing lifecycle projection.
   *
   * Coordinates:
   * 1. Transaction boundary.
   * 2. Idempotency marking via processed_events.
   * 3. Row locking & state validation.
   * 4. Concurrency version protection.
   * 5. Fields mutation & DB update.
   * 6. Timeline event log append.
   *
   * RFC-007 §16 / §17 / §21 / §35 / §36 / §37
   */
  public async transition(
    params: {
      orderId: number;
      event: DomainEvent;
      targetState: LifecycleState;
      title: string;
      description: string;
      actorType: ActorType;
      actorId: number | null;
      metadata?: Record<string, any>;
      applyChanges: (proj: OrderLifecycleProjection) => void;
    },
    connection?: any
  ): Promise<void> {
    const runInTransaction = async (conn: any) => {
      // 1. Gaters idempotency — insertion is the source of truth
      const isUnique = await this.processedEventsRepo.markProcessed(params.event.eventId, conn);
      if (!isUnique) {
        console.log(`[ProjectionUpdateService.transition] Duplicate event detected (eventId=${params.event.eventId}). Skipping.`);
        return;
      }

      // 2. Load the projection row with locking (FOR UPDATE on MySQL)
      const proj = await this.projRepo.findByOrderIdForUpdate(params.orderId, conn);
      if (!proj) {
        console.warn(`[ProjectionUpdateService.transition] Projection not found for orderId=${params.orderId}. Out of order creation skipped.`);
        return;
      }

      // 3. Stale event protection:
      // Verify that this event is newer than what was last processed.
      // - Version of event must be > lastProcessedVersion OR
      // - If versions are equal, the occurredAt must be strictly greater.
      // RFC-007 §17
      const isNewer =
        params.event.eventVersion > proj.lastProcessedVersion ||
        (params.event.eventVersion === proj.lastProcessedVersion &&
          params.event.occurredAt.getTime() > proj.lastProcessedOccurredAt.getTime());

      if (!isNewer) {
        console.log(
          `[ProjectionUpdateService.transition] Stale event ignored for orderId=${params.orderId}. ` +
          `Event version: ${params.event.eventVersion}, last processed version: ${proj.lastProcessedVersion}`
        );
        return;
      }

      // 4. Validate the state transition hierarchy
      this.validateTransition(proj.currentState, params.targetState, params.orderId);

      // 5. Apply the target changes & update version metadata
      params.applyChanges(proj);
      proj.currentState = params.targetState;
      proj.lastProcessedVersion = params.event.eventVersion;
      proj.lastProcessedOccurredAt = params.event.occurredAt;
      proj.updatedAt = new Date();
      proj.version += 1; // Increment concurrency lock version

      // Persist using optimistic locking (WHERE version = expected_version)
      await this.projRepo.update(proj, conn);

      // 6. Append timeline event log
      const timelineEvent = new TimelineEvent(
        null,
        params.orderId,
        params.event.eventId,
        params.event.eventType,
        params.targetState,
        params.title,
        params.description,
        params.event.occurredAt,
        params.actorType,
        params.actorId,
        params.metadata || null,
        params.event.correlationId,
        params.event.causationId
      );
      await this.timelineRepo.append(timelineEvent, conn);
    };

    try {
      if (connection) {
        await runInTransaction(connection);
      } else {
        await db.transaction(async (conn) => {
          await runInTransaction(conn);
        });
      }
    } catch (err: any) {
      throw this.handleDatabaseError(err, params.orderId);
    }
  }

  /**
   * Internal state transition mapping validator.
   */
  private validateTransition(from: LifecycleState, to: LifecycleState, orderId: number): void {
    if (from === to) return; // Idempotent state transition (self-transition is allowed)

    // Terminal states cannot transition out of
    if (
      from === LifecycleState.DELIVERED ||
      from === LifecycleState.FAILED ||
      from === LifecycleState.CANCELLED
    ) {
      throw new InvalidLifecycleTransitionError(from, to, orderId);
    }

    const allowedTransitions: Record<LifecycleState, LifecycleState[]> = {
      [LifecycleState.PENDING_PAYMENT]: [LifecycleState.CONFIRMED, LifecycleState.CANCELLED],
      [LifecycleState.CONFIRMED]: [LifecycleState.IN_PRODUCTION, LifecycleState.CANCELLED],
      [LifecycleState.IN_PRODUCTION]: [
        LifecycleState.READY_FOR_PICKUP,
        LifecycleState.CANCELLED,
        LifecycleState.FAILED,
      ],
      [LifecycleState.READY_FOR_PICKUP]: [
        LifecycleState.OUT_FOR_DELIVERY,
        LifecycleState.DELIVERED,
        LifecycleState.CANCELLED,
        LifecycleState.FAILED,
      ],
      [LifecycleState.OUT_FOR_DELIVERY]: [
        LifecycleState.DELIVERED,
        LifecycleState.FAILED,
        LifecycleState.CANCELLED,
      ],
      [LifecycleState.DELIVERED]: [],
      [LifecycleState.FAILED]: [],
      [LifecycleState.CANCELLED]: [],
    };

    const targets = allowedTransitions[from] || [];
    if (!targets.includes(to)) {
      throw new InvalidLifecycleTransitionError(from, to, orderId);
    }
  }

  /**
   * Database error classifier — maps concurrency locks and deadlocks to ProjectionConcurrencyError.
   */
  private handleDatabaseError(err: any, orderId: number): Error {
    if (err instanceof ProjectionConcurrencyError || err instanceof InvalidLifecycleTransitionError) {
      return err;
    }

    const msg = err?.message ?? '';
    const code = err?.code ?? '';

    if (
      msg.includes('database is locked') ||
      msg.includes('SQLITE_BUSY') ||
      code === 'SQLITE_BUSY' ||
      code === 'ER_LOCK_DEADLOCK' ||
      code === 'ER_LOCK_WAIT_TIMEOUT' ||
      msg.includes('deadlock') ||
      msg.includes('lock wait timeout')
    ) {
      return new ProjectionConcurrencyError(orderId);
    }

    return err;
  }
}
