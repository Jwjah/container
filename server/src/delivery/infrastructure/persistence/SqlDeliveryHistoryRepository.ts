import { IDeliveryHistoryRepository } from '../../interfaces/IDeliveryHistoryRepository';
import { DeliveryHistory } from '../../domain/entities/DeliveryHistory';
import db from '../../../config/database';

export class SqlDeliveryHistoryRepository implements IDeliveryHistoryRepository {
  private toEntity(row: any): DeliveryHistory {
    let parsedMetadata = null;
    if (row.metadata) {
      try {
        parsedMetadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch (e) {
        parsedMetadata = row.metadata;
      }
    }
    return new DeliveryHistory(
      row.id,
      row.delivery_assignment_id,
      row.previous_status,
      row.new_status,
      row.transition_name,
      row.performed_by_user_id,
      row.performed_by_type,
      parsedMetadata,
      row.correlation_id,
      new Date(row.created_at)
    );
  }

  public async create(h: DeliveryHistory, connection?: any): Promise<DeliveryHistory> {
    const executor = connection || db;
    const metaStr = h.metadata ? JSON.stringify(h.metadata) : null;

    const [result] = await executor.execute(
      `INSERT INTO delivery_history (
        delivery_assignment_id, previous_status, new_status, transition_name, performed_by_user_id, performed_by_type, metadata, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        h.deliveryAssignmentId,
        h.previousStatus,
        h.newStatus,
        h.transitionName,
        h.performedByUserId,
        h.performedByType,
        metaStr,
        h.correlationId
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new DeliveryHistory(
      insertedId,
      h.deliveryAssignmentId,
      h.previousStatus,
      h.newStatus,
      h.transitionName,
      h.performedByUserId,
      h.performedByType,
      h.metadata,
      h.correlationId,
      new Date()
    );
  }

  public async findByAssignmentId(assignmentId: number, connection?: any): Promise<DeliveryHistory[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_history WHERE delivery_assignment_id = ? ORDER BY id ASC`,
      [assignmentId]
    );
    return rows.map((r: any) => this.toEntity(r));
  }
}
