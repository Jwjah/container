import { randomUUID } from 'crypto';

export class CorrelationId {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Generates a new CorrelationId wrapping a random UUIDv4.
   */
  public static create(): CorrelationId {
    return new CorrelationId(randomUUID());
  }

  /**
   * Builds a CorrelationId from a string, falling back to a new generated UUID if empty.
   */
  public static fromString(value?: string | null): CorrelationId {
    if (!value || value.trim().length === 0) {
      return this.create();
    }
    return new CorrelationId(value);
  }

  public toString(): string {
    return this.value;
  }
}
