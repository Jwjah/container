import { DeliveryAgentAvailability } from '../../domain/entities/DeliveryAgentAvailability';

export interface IDeliveryDispatchStrategy {
  selectAgent(availableAgents: DeliveryAgentAvailability[]): DeliveryAgentAvailability | null;
}
