import { IPrintJobHistoryRepository } from '../../interfaces/IPrintJobHistoryRepository';
import { PrintJobHistory } from '../../domain/entities/PrintJobHistory';
import db from '../../../config/database';

export class SqlPrintJobHistoryRepository implements IPrintJobHistoryRepository {
  private toEntity(row: any): PrintJobHistory {
    return new PrintJobHistory(
      row.id,
      row.print_job_id,
      row.previous_status,
      row.new_status,
      row.actor_type as 'student' | 'shop' | 'system',
      row.transition_name as 'ACCEPT' | 'START_PRINTING' | 'MARK_READY' | 'CANCEL',
      row.changed_by_user_id,
      row.reason_code,
      row.reason_description,
      row.correlation_id,
      new Date(row.created_at)
    );
  }

  public async create(history: PrintJobHistory, connection?: any): Promise<PrintJobHistory> {
    const executor = connection || db;
    const [result] = await executor.execute(
      `INSERT INTO print_job_history (
        print_job_id, previous_status, new_status, actor_type, 
        transition_name, changed_by_user_id, reason_code, 
        reason_description, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        history.printJobId,
        history.previousStatus,
        history.newStatus,
        history.actorType,
        history.transitionName,
        history.changedByUserId,
        history.reasonCode,
        history.reasonDescription,
        history.correlationId
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new PrintJobHistory(
      insertedId,
      history.printJobId,
      history.previousStatus,
      history.newStatus,
      history.actorType,
      history.transitionName,
      history.changedByUserId,
      history.reasonCode,
      history.reasonDescription,
      history.correlationId,
      new Date()
    );
  }

  public async findByPrintJobId(printJobId: number, connection?: any): Promise<PrintJobHistory[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      'SELECT * FROM print_job_history WHERE print_job_id = ? ORDER BY created_at ASC',
      [printJobId]
    );
    return rows.map((r: any) => this.toEntity(r));
  }
}
