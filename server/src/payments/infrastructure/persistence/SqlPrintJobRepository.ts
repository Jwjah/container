import { IPrintJobRepository } from '../../interfaces/IPrintJobRepository';
import { PrintJob } from '../../domain/entities/PrintJob';
import { PrintJobStatus } from '../../domain/enums/PrintJobStatus';
import db from '../../../config/database';

export class SqlPrintJobRepository implements IPrintJobRepository {
  private toEntity(row: any): PrintJob {
    return new PrintJob(
      row.id,
      row.order_id,
      row.shop_id,
      row.student_id,
      row.status as PrintJobStatus,
      row.priority,
      row.estimated_completion_at ? new Date(row.estimated_completion_at) : null,
      row.completed_at ? new Date(row.completed_at) : null,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(job: PrintJob, connection?: any): Promise<PrintJob> {
    const executor = connection || db;
    const estStr = job.estimatedCompletionAt ? job.estimatedCompletionAt.toISOString() : null;
    const compStr = job.completedAt ? job.completedAt.toISOString() : null;

    const [result] = await executor.execute(
      `INSERT INTO print_jobs (
        order_id, shop_id, student_id, status, priority, estimated_completion_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        job.orderId,
        job.shopId,
        job.studentId,
        job.status,
        job.priority,
        estStr,
        compStr
      ]
    );

    const insertedId = result.insertId || result.lastID;
    return new PrintJob(
      insertedId,
      job.orderId,
      job.shopId,
      job.studentId,
      job.status,
      job.priority,
      job.estimatedCompletionAt,
      job.completedAt,
      new Date(),
      new Date()
    );
  }

  public async findByOrderId(orderId: number, connection?: any): Promise<PrintJob | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM print_jobs WHERE order_id = ?', [orderId]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }
}
