export class InvoiceNumberGenerator {
  public static async generate(sequenceCount: number): Promise<string> {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const seqStr = String(sequenceCount).padStart(6, '0');
    return `CP-INV-${yyyy}${mm}${dd}-${seqStr}`;
  }
}
