/**
 * StructuredLogger — provides standard structured JSON logs.
 *
 * RFC-008 Part 9 Specification
 */
export class StructuredLogger {
  private constructor(private readonly context: string) {}

  public static create(context: string): StructuredLogger {
    return new StructuredLogger(context);
  }

  public info(message: string, meta: Record<string, any> = {}): void {
    this.log('INFO', message, meta);
  }

  public warn(message: string, meta: Record<string, any> = {}): void {
    this.log('WARN', message, meta);
  }

  public error(message: string, error?: Error, meta: Record<string, any> = {}): void {
    const errorMeta = error
      ? { errorName: error.name, errorMessage: error.message, errorStack: error.stack }
      : {};
    this.log('ERROR', message, { ...meta, ...errorMeta });
  }

  private log(level: string, message: string, meta: Record<string, any>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...meta
    };
    console.log(JSON.stringify(logEntry));
  }
}
