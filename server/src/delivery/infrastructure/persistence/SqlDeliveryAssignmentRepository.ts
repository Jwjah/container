import { IDeliveryAssignmentRepository } from '../../interfaces/IDeliveryAssignmentRepository';
import { DeliveryAssignment } from '../../domain/entities/DeliveryAssignment';
import { DeliveryAssignmentStatus } from '../../domain/enums/DeliveryAssignmentStatus';
import db from '../../../config/database';

export class SqlDeliveryAssignmentRepository implements IDeliveryAssignmentRepository {
  private toEntity(row: any): DeliveryAssignment {
    return new DeliveryAssignment(
      row.id,
      row.fulfillment_id,
      row.order_id,
      row.shop_id,
      row.student_id,
      row.agent_id,
      row.status as DeliveryAssignmentStatus,
      row.correlation_id,
      row.version,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(a: DeliveryAssignment, connection?: any): Promise<DeliveryAssignment> {
    const executor = connection || db;
    const [result] = await executor.execute(
      `INSERT INTO delivery_assignments (
        fulfillment_id, order_id, shop_id, student_id, agent_id, status, correlation_id, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.fulfillmentId, a.orderId, a.shopId, a.studentId, a.agentId, a.status, a.correlationId, a.version]
    );
    const insertedId = (result as any).insertId || (result as any).lastID || 1;
    return new DeliveryAssignment(
      insertedId,
      a.fulfillmentId,
      a.orderId,
      a.shopId,
      a.studentId,
      a.agentId,
      a.status,
      a.correlationId,
      a.version,
      new Date(),
      new Date()
    );
  }

  public async findById(id: number, connection?: any): Promise<DeliveryAssignment | null> {
    const executor = connection || db;
    const [rows] = await executor.execute('SELECT * FROM delivery_assignments WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return null;
    return this.toEntity(rows[0]);
  }

  public async findByIdForUpdate(id: number, connection?: any): Promise<DeliveryAssignment | null> {
    const executor = connection || db;
    const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
    const sql = isSQLite
      ? 'SELECT * FROM delivery_assignments WHERE id = ?'
      : 'SELECT * FROM delivery_assignments WHERE id = ? FOR UPDATE';
    const [rows] = await executor.execute(sql, [id]);
    if (!rows || rows.length === 0) return null;
    return this.toEntity(rows[0]);
  }

  public async findActiveByAgentId(agentId: number, connection?: any): Promise<DeliveryAssignment | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_assignments 
       WHERE agent_id = ? AND status IN ('ASSIGNED', 'EN_ROUTE_TO_SHOP', 'DELIVERING') 
       LIMIT 1`,
      [agentId]
    );
    if (!rows || rows.length === 0) return null;
    return this.toEntity(rows[0]);
  }

  public async findActiveByFulfillmentId(fulfillmentId: number, connection?: any): Promise<DeliveryAssignment | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_assignments 
       WHERE fulfillment_id = ? AND status IN ('ASSIGNED', 'EN_ROUTE_TO_SHOP', 'DELIVERING') 
       LIMIT 1`,
      [fulfillmentId]
    );
    if (!rows || rows.length === 0) return null;
    return this.toEntity(rows[0]);
  }

  public async findPendingAssignments(connection?: any): Promise<DeliveryAssignment[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_assignments WHERE status = 'ASSIGNED'`
    );
    return rows.map((r: any) => this.toEntity(r));
  }

  public async findByCorrelationId(correlationId: string, connection?: any): Promise<DeliveryAssignment[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_assignments WHERE correlation_id = ?`,
      [correlationId]
    );
    return rows.map((r: any) => this.toEntity(r));
  }

  public async update(a: DeliveryAssignment, connection?: any): Promise<void> {
    const executor = connection || db;
    const nextVersion = a.version + 1;

    const [result] = await executor.execute(
      `UPDATE delivery_assignments SET 
        agent_id = ?,
        status = ?, 
        correlation_id = ?, 
        version = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND version = ?`,
      [a.agentId, a.status, a.correlationId, nextVersion, a.id, a.version]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Concurrency update failure: DeliveryAssignment #${a.id} was updated by another process or does not exist`);
    }
    (a as any).version = nextVersion; // Mutate version
  }
}
