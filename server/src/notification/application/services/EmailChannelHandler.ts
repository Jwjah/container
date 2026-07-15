import db from '../../../config/database';

/**
 * EmailChannelHandler — mock mail sender with failure simulation hook for tests.
 *
 * RFC-009 Specification
 */
export class EmailChannelHandler {
  /**
   * Mock-sends an email, resolving user email address from the DB.
   */
  public async sendEmail(
    recipientUserId: number,
    subject: string,
    bodyHtml: string,
    bodyText: string,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;

    // Fetch user email
    const [rows] = await executor.execute('SELECT email FROM users WHERE id = ?', [recipientUserId]);
    const userRow = (rows as any[])[0];
    const email = userRow?.email || `user${recipientUserId}@campus.edu`;

    // Simulate failure hook for testing retry mechanics
    if (email === 'fail@campus.edu' || subject.includes('SIMULATE_FAILURE')) {
      throw new Error('SMTP Server connection lost: connection timeout');
    }

    console.log(`✉️ [EmailChannelHandler] Email sent to ${email}:`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body Preview: ${bodyText.slice(0, 80)}...`);
  }
}
export const globalEmailChannelHandler = new EmailChannelHandler();
