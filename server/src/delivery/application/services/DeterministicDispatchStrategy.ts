import { IDeliveryDispatchStrategy } from './IDeliveryDispatchStrategy';
import { DeliveryAgentAvailability } from '../../domain/entities/DeliveryAgentAvailability';

export class DeterministicDispatchStrategy implements IDeliveryDispatchStrategy {
  public selectAgent(availableAgents: DeliveryAgentAvailability[]): DeliveryAgentAvailability | null {
    if (availableAgents.length === 0) return null;

    const sorted = [...availableAgents].sort((a, b) => {
      // 1. Lowest active workload first
      if (a.activeWorkload !== b.activeWorkload) {
        return a.activeWorkload - b.activeWorkload;
      }

      // 2. Oldest idle agent first (lowest lastIdleAt timestamp)
      const timeA = a.lastIdleAt ? new Date(a.lastIdleAt).getTime() : 0;
      const timeB = b.lastIdleAt ? new Date(b.lastIdleAt).getTime() : 0;
      return timeA - timeB;
    });

    return sorted[0];
  }
}
