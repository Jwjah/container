export class NotificationTemplate {
  constructor(
    public readonly id: number | null,
    public readonly name: string,
    public readonly subject: string | null,
    public readonly bodyMarkdown: string,
    public readonly bodyHtml: string,
    public readonly version: number = 1,
    public readonly createdAt: Date = new Date()
  ) {
    if (!name) {
      throw new Error('Template name cannot be empty');
    }
    if (!bodyMarkdown) {
      throw new Error('Template bodyMarkdown cannot be empty');
    }
    if (!bodyHtml) {
      throw new Error('Template bodyHtml cannot be empty');
    }
  }
}
