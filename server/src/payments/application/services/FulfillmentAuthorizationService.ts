import db from '../../../config/database';
import { Fulfillment } from '../../domain/entities/Fulfillment';

export class FulfillmentAuthorizationService {
  private async getUserRole(userId: number, connection: any): Promise<string> {
    const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows && rows.length > 0 ? rows[0].role : '';
  }

  private async isShopOwner(shopId: number, userId: number, connection: any): Promise<boolean> {
    const [rows] = await connection.execute('SELECT user_id FROM shops WHERE id = ?', [shopId]);
    return rows && rows.length > 0 && rows[0].user_id === userId;
  }

  public async assertCanAssignAgent(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;
    const role = await this.getUserRole(userId, executor);
    if (role === 'admin') return;

    const isOwner = await this.isShopOwner(fulfillment.shopId, userId, executor);
    if (isOwner) return;

    throw new Error('Forbidden: Only shop manager or admin can assign a delivery agent');
  }

  public async assertCanStartDelivery(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    if (fulfillment.assignedAgentId !== userId) {
      throw new Error('Forbidden: Only the assigned delivery agent can start delivery');
    }
  }

  public async assertCanVerifyOtp(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    if (fulfillment.assignedAgentId !== userId) {
      throw new Error('Forbidden: Only the assigned delivery agent can verify OTP');
    }
  }

  public async assertCanCompleteDelivery(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    if (fulfillment.assignedAgentId !== userId) {
      throw new Error('Forbidden: Only the assigned delivery agent can complete delivery');
    }
  }

  public async assertCanCompletePickup(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;
    const role = await this.getUserRole(userId, executor);
    if (role === 'admin') return;

    const isOwner = await this.isShopOwner(fulfillment.shopId, userId, executor);
    if (isOwner) return;

    throw new Error('Forbidden: Only shop manager or admin can complete direct pickup');
  }

  public async assertCanFailDelivery(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;
    const role = await this.getUserRole(userId, executor);
    if (role === 'admin') return;

    if (fulfillment.assignedAgentId === userId) return;

    throw new Error('Forbidden: Only the assigned agent or admin can fail delivery');
  }

  public async assertCanRegenerateOtp(
    fulfillment: Fulfillment,
    userId: number,
    connection?: any
  ): Promise<void> {
    if (fulfillment.studentId === userId) return;

    const executor = connection || db;
    const role = await this.getUserRole(userId, executor);
    if (role === 'admin') return;

    const isOwner = await this.isShopOwner(fulfillment.shopId, userId, executor);
    if (isOwner) return;

    throw new Error('Forbidden: Only the student, shop manager, or admin can regenerate OTP');
  }
}
