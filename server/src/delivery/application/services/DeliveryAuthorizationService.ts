import db from '../../../config/database';
import { DeliveryAssignment } from '../../domain/entities/DeliveryAssignment';

export class DeliveryAuthorizationService {
  private async getUserRole(userId: number, connection: any): Promise<string> {
    const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows && rows.length > 0 ? rows[0].role : '';
  }

  private async isShopOwner(shopId: number, userId: number, connection: any): Promise<boolean> {
    const [rows] = await connection.execute('SELECT user_id FROM shops WHERE id = ?', [shopId]);
    return rows && rows.length > 0 && rows[0].user_id === userId;
  }

  public async assertCanAcceptOrRejectOrUpdate(
    assignment: DeliveryAssignment,
    userId: number,
    connection?: any
  ): Promise<void> {
    if (assignment.agentId === userId) return;

    const executor = connection || db;
    const role = await this.getUserRole(userId, executor);
    if (role === 'admin') return;

    throw new Error('Forbidden: Only the assigned delivery agent can perform this action');
  }

  public async assertCanAssignOrReassign(
    shopId: number,
    userId: number,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;
    const role = await this.getUserRole(userId, executor);
    if (role === 'admin') return;

    const isOwner = await this.isShopOwner(shopId, userId, executor);
    if (isOwner) return;

    throw new Error('Forbidden: Only shop manager or admin can assign or reassign agents');
  }
}
