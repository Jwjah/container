import { IFulfillmentHistoryRepository } from '../../interfaces/IFulfillmentHistoryRepository';
import { FulfillmentHistory } from '../../domain/entities/FulfillmentHistory';
import { FulfillmentTransition } from '../../domain/enums/FulfillmentTransition';
import db from '../../../config/database';

export class SqlFulfillmentHistoryRepository implements IFulfillmentHistoryRepository {
  private toEntity(row: any): FulfillmentHistory {
    return new FulfillmentHistory(
      row.id,
      row.fulfillment_id,
      row.previous_status,
      row.new_status,
      row.transition_name as FulfillmentTransition,
      row.performed_by_type,
      row.performed_by_user_id,
      row.failure_reason,
      row.proof_of_delivery_reference,
      row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      row.correlation_id,
      new Date(row.created_at)
    );
  }

  public async create(history: FulfillmentHistory, connection?: any): Promise<FulfillmentHistory> {
    const executor = connection || db;
    const metadataStr = history.metadata ? JSON.stringify(history.metadata) : null;

    const [result] = await executor.execute(
      `INSERT INTO fulfillment_history (
        fulfillment_id, previous_status, new_status, transition_name, 
        performed_by_type, performed_by_user_id, failure_reason, 
        proof_of_delivery_reference, metadata, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        history.fulfillmentId,
        history.previousStatus,
        history.newStatus,
        history.transitionName,
        history.performedByType,
        history.performedByUserId,
        history.failureReason,
        history.proofOfDeliveryReference,
        metadataStr,
        history.correlationId
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new FulfillmentHistory(
      insertedId,
      history.fulfillmentId,
      history.previousStatus,
      history.newStatus,
      history.transitionName,
      history.performedByType,
      history.performedByUserId,
      history.failureReason,
      history.proofOfDeliveryReference,
      history.metadata,
      history.correlationId,
      new Date()
    );
  }

  public async findByFulfillmentId(fulfillmentId: number, connection?: any): Promise<FulfillmentHistory[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM fulfillment_history WHERE fulfillment_id = ? ORDER BY created_at ASC',
      [fulfillmentId]
    );
    return rows.map((r: any) => this.toEntity(r));
  }
}
