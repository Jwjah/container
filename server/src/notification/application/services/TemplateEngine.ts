/**
 * TemplateEngine — replaces named placeholders in notification templates.
 *
 * RFC-009 Specification
 */
export class TemplateEngine {
  /**
   * Replaces placeholders formatted as {{variableName}} or {variableName} with provided context variables.
   */
  public render(templateString: string, variables: Record<string, any>): string {
    if (!templateString) return '';
    let rendered = templateString;

    for (const [key, value] of Object.entries(variables)) {
      const escapedValue = value !== undefined && value !== null ? String(value) : '';
      // Support {{key}}
      rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), escapedValue);
      // Support {key}
      rendered = rendered.replace(new RegExp(`\\{${key}\\}`, 'g'), escapedValue);
    }

    return rendered;
  }

  /**
   * Helper to translate markdown formatting (like links, bold) to simple HTML format.
   */
  public markdownToHtml(markdown: string): string {
    if (!markdown) return '';
    let html = markdown;

    // Convert **bold** to <strong>bold</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em>italic</em>
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Convert [Link Text](URL) to <a href="URL">Link Text</a>
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

    // Convert newlines to <br/>
    html = html.replace(/\n/g, '<br/>\n');

    return `<p>\n${html}\n</p>`;
  }

  /**
   * Strips markdown to plain text.
   */
  public markdownToPlainText(markdown: string): string {
    if (!markdown) return '';
    let plain = markdown;

    // Strip bold/italic markup
    plain = plain.replace(/\*\*|\*/g, '');

    // Convert link markdown [Text](Url) to "Text (Url)"
    plain = plain.replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)');

    return plain;
  }
}
export const globalTemplateEngine = new TemplateEngine();
