import { DeliveryAgentAvailability } from '../domain/entities/DeliveryAgentAvailability';

export interface IDeliveryAgentAvailabilityRepository {
  create(availability: DeliveryAgentAvailability, connection?: any): Promise<DeliveryAgentAvailability>;
  findById(agentId: number, connection?: any): Promise<DeliveryAgentAvailability | null>;
  findByIdForUpdate(agentId: number, connection?: any): Promise<DeliveryAgentAvailability | null>;
  findAllAvailable(connection?: any): Promise<DeliveryAgentAvailability[]>;
  update(availability: DeliveryAgentAvailability, connection?: any): Promise<void>;
}
