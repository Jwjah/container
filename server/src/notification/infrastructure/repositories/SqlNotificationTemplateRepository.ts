import { INotificationTemplateRepository } from '../../interfaces/INotificationTemplateRepository';
import { NotificationTemplate } from '../../domain/entities/NotificationTemplate';
import db from '../../../config/database';

export class SqlNotificationTemplateRepository implements INotificationTemplateRepository {
  public async findByName(name: string, connection?: any): Promise<NotificationTemplate | null> {
    const executor = connection || db;
    try {
      const [rows] = await executor.execute('SELECT * FROM notification_templates WHERE name = ?', [name]);
      const row = (rows as any[])[0];
      if (!row) return null;

      return new NotificationTemplate(
        row.id,
        row.name,
        row.subject,
        row.body_markdown,
        row.body_html,
        row.version,
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
      );
    } catch (err: any) {
      console.error('[SqlNotificationTemplateRepository.findByName] Error:', err.message);
      throw err;
    }
  }

  public async create(template: NotificationTemplate, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      const query = `
        INSERT INTO notification_templates (
          name, subject, body_markdown, body_html, version
        ) VALUES (?, ?, ?, ?, ?)
      `;
      await executor.execute(query, [
        template.name,
        template.subject,
        template.bodyMarkdown,
        template.bodyHtml,
        template.version
      ]);
    } catch (err: any) {
      console.error('[SqlNotificationTemplateRepository.create] Error:', err.message);
      throw err;
    }
  }

  public async update(template: NotificationTemplate, connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      const query = `
        UPDATE notification_templates 
        SET subject = ?, body_markdown = ?, body_html = ?, version = ?
        WHERE id = ?
      `;
      await executor.execute(query, [
        template.subject,
        template.bodyMarkdown,
        template.bodyHtml,
        template.version,
        template.id
      ]);
    } catch (err: any) {
      console.error('[SqlNotificationTemplateRepository.update] Error:', err.message);
      throw err;
    }
  }

  public async deleteAll(connection?: any): Promise<void> {
    const executor = connection || db;
    try {
      await executor.execute('DELETE FROM notification_templates');
    } catch (err: any) {
      console.error('[SqlNotificationTemplateRepository.deleteAll] Error:', err.message);
      throw err;
    }
  }
}
export const globalNotificationTemplateRepository = new SqlNotificationTemplateRepository();
