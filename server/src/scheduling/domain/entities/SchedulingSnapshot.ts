/**
 * SchedulingSnapshot — entity representing a serialized checkpoint of scheduling projection state.
 *
 * RFC-008 Refinement 1 Specification
 */
export class SchedulingSnapshot {
  constructor(
    public readonly shopId: number,
    public readonly lastEventId: string,
    public readonly lastEventSequence: number,
    public readonly stateData: string, // JSON string
    public readonly createdAt: Date = new Date()
  ) {
    if (!lastEventId) {
      throw new Error('lastEventId must be a non-empty string');
    }
    if (lastEventSequence < 0) {
      throw new Error('lastEventSequence cannot be negative');
    }
    if (!stateData) {
      throw new Error('stateData cannot be empty');
    }
  }
}
