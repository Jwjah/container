import { IDeliveryAgentAvailabilityRepository } from '../../interfaces/IDeliveryAgentAvailabilityRepository';
import { DeliveryAgentAvailability } from '../../domain/entities/DeliveryAgentAvailability';
import { DeliveryAgentStatus } from '../../domain/enums/DeliveryAgentStatus';
import db from '../../../config/database';

export class AgentAvailabilityService {
  constructor(
    private readonly availabilityRepository: IDeliveryAgentAvailabilityRepository
  ) {}

  public async getOrCreateAgentAvailability(
    agentId: number,
    connection?: any
  ): Promise<DeliveryAgentAvailability> {
    const executor = connection || db;
    let av = await this.availabilityRepository.findById(agentId, executor);
    if (!av) {
      const [rows] = await executor.execute('SELECT role FROM users WHERE id = ?', [agentId]);
      if (!rows || rows.length === 0) {
        throw new Error(`User with ID ${agentId} not found`);
      }

      const now = new Date();
      av = new DeliveryAgentAvailability(
        agentId,
        DeliveryAgentStatus.AVAILABLE,
        0,
        null,
        now,
        1,
        now,
        now
      );
      await this.availabilityRepository.create(av, executor);
    }
    return av;
  }

  public async assignAgent(agentId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const av = await this.getOrCreateAgentAvailability(agentId, executor);
    
    // Fetch for update to serialize concurrent writes
    const lockedAv = await this.availabilityRepository.findByIdForUpdate(agentId, executor);
    if (!lockedAv) {
      throw new Error(`Agent availability lock failed for agent ID ${agentId}`);
    }

    lockedAv.assign();
    await this.availabilityRepository.update(lockedAv, executor);
  }

  public async releaseAgent(agentId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const lockedAv = await this.availabilityRepository.findByIdForUpdate(agentId, executor);
    if (!lockedAv) return;

    lockedAv.release();
    await this.availabilityRepository.update(lockedAv, executor);
  }

  public async restoreAvailability(agentId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const lockedAv = await this.availabilityRepository.findByIdForUpdate(agentId, executor);
    if (!lockedAv) return;

    lockedAv.restoreAvailability();
    await this.availabilityRepository.update(lockedAv, executor);
  }

  public async setOffline(agentId: number, connection?: any): Promise<void> {
    const executor = connection || db;
    const lockedAv = await this.availabilityRepository.findByIdForUpdate(agentId, executor);
    if (!lockedAv) return;

    lockedAv.setOffline();
    await this.availabilityRepository.update(lockedAv, executor);
  }
}
