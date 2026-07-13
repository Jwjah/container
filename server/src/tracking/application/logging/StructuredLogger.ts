export interface StructuredLogContext {
  requestId?: string;
  correlationId?: string;
  workerId?: string;
  eventId?: string;
  aggregateId?: string;
  aggregateType?: string;
  projectionName?: string;
  duration?: number;
  status?: string;
}

/**
 * StructuredLogger — formats log entries strictly as structural JSON objects.
 *
 * RFC-007 Phase 7F Specification
 */
export class StructuredLogger {
  public static log(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: StructuredLogContext,
    error?: Error
  ): void {
    const logObj = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: context?.requestId ?? null,
      correlationId: context?.correlationId ?? null,
      workerId: context?.workerId ?? null,
      eventId: context?.eventId ?? null,
      aggregateId: context?.aggregateId ?? null,
      aggregateType: context?.aggregateType ?? null,
      projectionName: context?.projectionName ?? 'order_lifecycle_projections',
      duration: context?.duration ?? null,
      status: context?.status ?? null,
      errorStack: error ? error.stack : undefined
    };

    console.log(JSON.stringify(logObj));
  }

  public static info(message: string, context?: StructuredLogContext): void {
    this.log('INFO', message, context);
  }

  public static warn(message: string, context?: StructuredLogContext): void {
    this.log('WARN', message, context);
  }

  public static error(message: string, error?: Error, context?: StructuredLogContext): void {
    this.log('ERROR', message, context, error);
  }
}
