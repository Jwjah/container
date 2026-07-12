import { IPrintJobAuthorizationService } from './IPrintJobAuthorizationService';
import { IPrintJobRepository } from '../../interfaces/IPrintJobRepository';
import db from '../../../config/database';

export class PrintJobAuthorizationService implements IPrintJobAuthorizationService {
  constructor(private readonly printJobRepository: IPrintJobRepository) {}

  public async assertShopAccess(printJobId: number, userId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const job = await this.printJobRepository.findById(printJobId, executor);
    if (!job) {
      throw new Error('Print job not found');
    }

    const [shop] = await executor.execute('SELECT user_id FROM shops WHERE id = ?', [job.shopId]);
    if (!shop || shop.length === 0 || shop[0].user_id !== userId) {
      throw new Error('Forbidden: You do not own the shop managing this print job');
    }
  }

  public async assertUserAccess(printJobId: number, userId: number, connection?: any): Promise<'student' | 'shop'> {
    const executor = connection || db;
    const job = await this.printJobRepository.findById(printJobId, executor);
    if (!job) {
      throw new Error('Print job not found');
    }

    if (job.studentId === userId) {
      return 'student';
    }

    const [shop] = await executor.execute('SELECT user_id FROM shops WHERE id = ?', [job.shopId]);
    if (shop && shop.length > 0 && shop[0].user_id === userId) {
      return 'shop';
    }

    throw new Error('Forbidden: Access denied to this print job');
  }
}
