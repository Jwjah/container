export class PrintJobHistory {
  constructor(
    public readonly id: number | null,
    public readonly printJobId: number,
    public readonly previousStatus: string,
    public readonly newStatus: string,
    public readonly actorType: 'student' | 'shop' | 'system',
    public readonly transitionName: 'ACCEPT' | 'START_PRINTING' | 'MARK_READY' | 'CANCEL',
    public readonly changedByUserId: number,
    public readonly reasonCode: string | null,
    public readonly reasonDescription: string | null,
    public readonly correlationId: string,
    public readonly createdAt: Date | null = null
  ) {}
}
