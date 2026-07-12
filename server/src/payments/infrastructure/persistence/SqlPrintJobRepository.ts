import { IPrintJobRepository } from '../../interfaces/IPrintJobRepository';
import { PrintJob } from '../../domain/entities/PrintJob';
import { PrintJobStatus } from '../../domain/enums/PrintJobStatus';
import { CancellationReason } from '../../domain/enums/CancellationReason';
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
      row.version,
      row.last_status_changed_at ? new Date(row.last_status_changed_at) : null,
      row.accepted_at ? new Date(row.accepted_at) : null,
      row.printing_started_at ? new Date(row.printing_started_at) : null,
      row.ready_at ? new Date(row.ready_at) : null,
      row.cancelled_at ? new Date(row.cancelled_at) : null,
      row.completed_at ? new Date(row.completed_at) : null,
      row.cancellation_reason_code as CancellationReason,
      row.cancellation_description,
      row.estimated_completion_at ? new Date(row.estimated_completion_at) : null,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(job: PrintJob, connection?: any): Promise<PrintJob> {
    const executor = connection || db;
    const lastStatusChangedStr = job.lastStatusChangedAt ? job.lastStatusChangedAt.toISOString() : null;
    const acceptedStr = job.acceptedAt ? job.acceptedAt.toISOString() : null;
    const printingStartedStr = job.printingStartedAt ? job.printingStartedAt.toISOString() : null;
    const readyStr = job.readyAt ? job.readyAt.toISOString() : null;
    const cancelledStr = job.cancelledAt ? job.cancelledAt.toISOString() : null;
    const completedStr = job.completedAt ? job.completedAt.toISOString() : null;
    const estimatedStr = job.estimatedCompletionAt ? job.estimatedCompletionAt.toISOString() : null;

    const [result] = await executor.execute(
      `INSERT INTO print_jobs (
        order_id, shop_id, student_id, status, priority, version, 
        last_status_changed_at, accepted_at, printing_started_at, 
        ready_at, cancelled_at, completed_at, cancellation_reason_code, 
        cancellation_description, estimated_completion_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.orderId,
        job.shopId,
        job.studentId,
        job.status,
        job.priority,
        job.version,
        lastStatusChangedStr,
        acceptedStr,
        printingStartedStr,
        readyStr,
        cancelledStr,
        completedStr,
        job.cancellationReasonCode,
        job.cancellationDescription,
        estimatedStr
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
      job.version,
      job.lastStatusChangedAt,
      job.acceptedAt,
      job.printingStartedAt,
      job.readyAt,
      job.cancelledAt,
      job.completedAt,
      job.cancellationReasonCode,
      job.cancellationDescription,
      job.estimatedCompletionAt,
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

  public async findById(id: number, connection?: any): Promise<PrintJob | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM print_jobs WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async findByIdForUpdate(id: number, connection?: any): Promise<PrintJob | null> {
    const executor = connection || db;
    const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
    const sql = isSQLite 
      ? 'SELECT * FROM print_jobs WHERE id = ?' 
      : 'SELECT * FROM print_jobs WHERE id = ? FOR UPDATE';
      
    const [rows] = await executor.execute(sql, [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return this.toEntity(rows[0]);
  }

  public async findByShopIdAndStatus(shopId: number, statuses: string[], connection?: any): Promise<PrintJob[]> {
    const executor = connection || db;
    if (statuses.length === 0) return [];
    
    const placeholders = statuses.map(() => '?').join(', ');
    const [rows] = await executor.execute(
      `SELECT * FROM print_jobs WHERE shop_id = ? AND status IN (${placeholders}) ORDER BY priority DESC, created_at ASC`,
      [shopId, ...statuses]
    );
    
    return rows.map((r: any) => this.toEntity(r));
  }

  public async update(printJob: PrintJob, connection?: any): Promise<void> {
    const executor = connection || db;
    
    const lastStatusChangedStr = printJob.lastStatusChangedAt ? printJob.lastStatusChangedAt.toISOString() : null;
    const acceptedStr = printJob.acceptedAt ? printJob.acceptedAt.toISOString() : null;
    const printingStartedStr = printJob.printingStartedAt ? printJob.printingStartedAt.toISOString() : null;
    const readyStr = printJob.readyAt ? printJob.readyAt.toISOString() : null;
    const cancelledStr = printJob.cancelledAt ? printJob.cancelledAt.toISOString() : null;
    const completedStr = printJob.completedAt ? printJob.completedAt.toISOString() : null;
    const estimatedStr = printJob.estimatedCompletionAt ? printJob.estimatedCompletionAt.toISOString() : null;

    const nextVersion = printJob.version + 1;

    const [result] = await executor.execute(
      `UPDATE print_jobs SET 
        status = ?, 
        priority = ?, 
        version = ?, 
        last_status_changed_at = ?, 
        accepted_at = ?, 
        printing_started_at = ?, 
        ready_at = ?, 
        cancelled_at = ?, 
        completed_at = ?, 
        cancellation_reason_code = ?, 
        cancellation_description = ?, 
        estimated_completion_at = ?, 
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND version = ?`,
      [
        printJob.status,
        printJob.priority,
        nextVersion,
        lastStatusChangedStr,
        acceptedStr,
        printingStartedStr,
        readyStr,
        cancelledStr,
        completedStr,
        printJob.cancellationReasonCode,
        printJob.cancellationDescription,
        estimatedStr,
        printJob.id,
        printJob.version
      ]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Concurrency update failure: Print job #${printJob.id} was updated by another process or does not exist`);
    }

    printJob.version = nextVersion;
  }
}
