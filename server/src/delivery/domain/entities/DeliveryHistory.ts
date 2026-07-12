export class DeliveryHistory {
  constructor(
    public readonly id: number | null,
    public readonly deliveryAssignmentId: number,
    public readonly previousStatus: string,
    public readonly newStatus: string,
    public readonly transitionName: string,
    public readonly performedByUserId: number,
    public readonly performedByType: string,
    public readonly metadata: any | null,
    public readonly correlationId: string,
    public readonly createdAt: Date | null = null
  ) {}
}
