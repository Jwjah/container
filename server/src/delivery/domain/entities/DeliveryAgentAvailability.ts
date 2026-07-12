import { DeliveryAgentStatus } from '../enums/DeliveryAgentStatus';

export class DeliveryAgentAvailability {
  constructor(
    public readonly agentId: number,
    public status: DeliveryAgentStatus,
    public activeWorkload: number,
    public lastAssignedAt: Date | null,
    public lastIdleAt: Date | null,
    public version: number,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  public assign(): void {
    const now = new Date();
    this.status = DeliveryAgentStatus.BUSY;
    this.activeWorkload += 1;
    this.lastAssignedAt = now;
    this.updatedAt = now;
  }

  public release(): void {
    const now = new Date();
    this.activeWorkload = Math.max(0, this.activeWorkload - 1);
    if (this.activeWorkload === 0) {
      this.status = DeliveryAgentStatus.AVAILABLE;
      this.lastIdleAt = now;
    }
    this.updatedAt = now;
  }

  public restoreAvailability(): void {
    const now = new Date();
    this.status = DeliveryAgentStatus.AVAILABLE;
    this.activeWorkload = 0;
    this.lastIdleAt = now;
    this.updatedAt = now;
  }

  public setOffline(): void {
    const now = new Date();
    this.status = DeliveryAgentStatus.OFFLINE;
    this.updatedAt = now;
  }
}
