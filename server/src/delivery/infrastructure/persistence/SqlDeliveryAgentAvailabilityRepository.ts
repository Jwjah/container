import { IDeliveryAgentAvailabilityRepository } from '../../interfaces/IDeliveryAgentAvailabilityRepository';
import { DeliveryAgentAvailability } from '../../domain/entities/DeliveryAgentAvailability';
import { DeliveryAgentStatus } from '../../domain/enums/DeliveryAgentStatus';
import db from '../../../config/database';

export class SqlDeliveryAgentAvailabilityRepository implements IDeliveryAgentAvailabilityRepository {
  private toEntity(row: any): DeliveryAgentAvailability {
    return new DeliveryAgentAvailability(
      row.agent_id,
      row.status as DeliveryAgentStatus,
      row.active_workload,
      row.last_assigned_at ? new Date(row.last_assigned_at) : null,
      row.last_idle_at ? new Date(row.last_idle_at) : null,
      row.version,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  public async create(av: DeliveryAgentAvailability, connection?: any): Promise<DeliveryAgentAvailability> {
    const executor = connection || db;
    const assignedStr = av.lastAssignedAt ? (typeof av.lastAssignedAt.toISOString === 'function' ? av.lastAssignedAt.toISOString() : av.lastAssignedAt) : null;
    const idleStr = av.lastIdleAt ? (typeof av.lastIdleAt.toISOString === 'function' ? av.lastIdleAt.toISOString() : av.lastIdleAt) : null;

    await executor.execute(
      `INSERT INTO delivery_agent_availability (
        agent_id, status, active_workload, last_assigned_at, last_idle_at, version
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        av.agentId,
        av.status,
        av.activeWorkload,
        assignedStr,
        idleStr,
        av.version
      ]
    );

    return av;
  }

  public async findById(agentId: number, connection?: any): Promise<DeliveryAgentAvailability | null> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_agent_availability WHERE agent_id = ?`,
      [agentId]
    );
    if (!rows || rows.length === 0) return null;
    return this.toEntity(rows[0]);
  }

  public async findByIdForUpdate(agentId: number, connection?: any): Promise<DeliveryAgentAvailability | null> {
    const executor = connection || db;
    const isSQLite = process.env.DB_MODE === 'sqlite' || process.env.DB_HOST === 'mysql9.serv00.com' || !process.env.DB_HOST;
    const sql = isSQLite
      ? 'SELECT * FROM delivery_agent_availability WHERE agent_id = ?'
      : 'SELECT * FROM delivery_agent_availability WHERE agent_id = ? FOR UPDATE';
    const [rows] = await executor.execute(sql, [agentId]);
    if (!rows || rows.length === 0) return null;
    return this.toEntity(rows[0]);
  }

  public async findAllAvailable(connection?: any): Promise<DeliveryAgentAvailability[]> {
    const executor = connection || db;
    const [rows] = await executor.execute(
      `SELECT * FROM delivery_agent_availability WHERE status = 'AVAILABLE'`
    );
    return rows.map((r: any) => this.toEntity(r));
  }

  public async update(av: DeliveryAgentAvailability, connection?: any): Promise<void> {
    const executor = connection || db;
    const nextVersion = av.version + 1;
    const assignedStr = av.lastAssignedAt ? (typeof av.lastAssignedAt.toISOString === 'function' ? av.lastAssignedAt.toISOString() : av.lastAssignedAt) : null;
    const idleStr = av.lastIdleAt ? (typeof av.lastIdleAt.toISOString === 'function' ? av.lastIdleAt.toISOString() : av.lastIdleAt) : null;

    const [result] = await executor.execute(
      `UPDATE delivery_agent_availability SET 
        status = ?, 
        active_workload = ?, 
        last_assigned_at = ?, 
        last_idle_at = ?, 
        version = ?, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE agent_id = ? AND version = ?`,
      [
        av.status,
        av.activeWorkload,
        assignedStr,
        idleStr,
        nextVersion,
        av.agentId,
        av.version
      ]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Concurrency update failure: DeliveryAgentAvailability #${av.agentId} was updated by another process or does not exist`);
    }
    (av as any).version = nextVersion; // Mutate version
  }
}
