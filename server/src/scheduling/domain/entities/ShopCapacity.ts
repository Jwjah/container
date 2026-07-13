/**
 * ShopCapacity — Aggregate Root managing overall capacity configurations and overload thresholds.
 *
 * RFC-008 Refinement 3 Specification
 */
export class ShopCapacity {
  constructor(
    public readonly shopId: number,
    public maxParallelOrders: number = 5,
    public overloadWaitThresholdSeconds: number = 7200, // 2 hours
    public isAcceptingOrders: boolean = true,
    public version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (maxParallelOrders <= 0) {
      throw new Error('maxParallelOrders must be positive');
    }
    if (overloadWaitThresholdSeconds <= 0) {
      throw new Error('overloadWaitThresholdSeconds must be positive');
    }
  }

  /**
   * Disable order acceptance.
   */
  public disableAcceptance(): void {
    this.isAcceptingOrders = false;
    this.updatedAt = new Date();
  }

  /**
   * Enable order acceptance.
   */
  public enableAcceptance(): void {
    this.isAcceptingOrders = true;
    this.updatedAt = new Date();
  }

  /**
   * Update capacity limits.
   */
  public updateLimits(maxParallel: number, overloadThreshold: number): void {
    if (maxParallel <= 0 || overloadThreshold <= 0) {
      throw new Error('Limits must be positive integers');
    }
    this.maxParallelOrders = maxParallel;
    this.overloadWaitThresholdSeconds = overloadThreshold;
    this.updatedAt = new Date();
  }
}
