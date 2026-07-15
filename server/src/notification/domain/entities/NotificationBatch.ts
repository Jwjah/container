export class NotificationBatch {
  constructor(
    public readonly id: number | null,
    public readonly shopId: number,
    public readonly recipientCount: number,
    public status: string = 'draft',
    public readonly createdAt: Date = new Date()
  ) {}

  public markAsSent(): void {
    this.status = 'sent';
  }
}
