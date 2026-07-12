import { IDeliveryDispatchStrategy } from './IDeliveryDispatchStrategy';
import { IDeliveryAgentAvailabilityRepository } from '../../interfaces/IDeliveryAgentAvailabilityRepository';
import { AgentAvailabilityService } from './AgentAvailabilityService';
import db from '../../../config/database';

export class DeliveryDispatchService {
  constructor(
    private readonly availabilityRepository: IDeliveryAgentAvailabilityRepository,
    private readonly availabilityService: AgentAvailabilityService,
    private readonly strategy: IDeliveryDispatchStrategy
  ) {}

  public async selectAgent(connection?: any): Promise<number | null> {
    const executor = connection || db;

    // Find all users with role = 'agent' to make sure their availability is initialized
    const [users] = await executor.execute("SELECT id FROM users WHERE role = 'agent'");
    for (const u of users) {
      await this.availabilityService.getOrCreateAgentAvailability(u.id, executor);
    }

    // Now fetch all available agents
    const available = await this.availabilityRepository.findAllAvailable(executor);

    // Apply the strategy
    const selected = this.strategy.selectAgent(available);
    return selected ? selected.agentId : null;
  }
}
