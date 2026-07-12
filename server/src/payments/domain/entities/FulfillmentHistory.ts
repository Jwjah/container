import { FulfillmentTransition } from '../enums/FulfillmentTransition';

export class FulfillmentHistory {
  constructor(
    public readonly id: number | null,
    public readonly fulfillmentId: number,
    public readonly previousStatus: string,
    public readonly newStatus: string,
    public readonly transitionName: FulfillmentTransition,
    public readonly performedByType: string,
    public readonly performedByUserId: number,
    public readonly failureReason: string | null,
    public readonly proofOfDeliveryReference: string | null,
    public readonly metadata: any | null,
    public readonly correlationId: string,
    public readonly createdAt: Date | null = null
  ) {}
}
