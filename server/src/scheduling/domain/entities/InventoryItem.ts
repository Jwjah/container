/**
 * InventoryItem — Aggregate Root managing supply levels (Paper sizes, Ink colors) generically.
 *
 * RFC-008 Refinement 5 Specification
 */
export class InventoryItem {
  constructor(
    public id: number | null,
    public readonly shopId: number,
    public readonly type: string, // e.g. 'paper', 'ink'
    public readonly variant: string, // e.g. 'A4', 'Black'
    public quantity: number,
    public readonly unit: string, // e.g. 'sheets', 'percentage'
    public lowStockThreshold: number = 100.0,
    public version: number = 1,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (quantity < 0) {
      throw new Error('Inventory quantity cannot be negative');
    }
  }

  /**
   * Asserts if stock is sufficient for requested quantity.
   */
  public hasSufficientStock(requestedQty: number): boolean {
    return this.quantity >= requestedQty;
  }

  /**
   * Deducts quantity for a reservation request.
   */
  public deduct(qty: number): void {
    if (qty <= 0) {
      throw new Error('Deduction quantity must be positive');
    }
    if (this.quantity < qty) {
      throw new Error(`Insufficient inventory stock for ${this.type} (${this.variant}). Available: ${this.quantity}, Requested: ${qty}`);
    }
    this.quantity -= qty;
    this.updatedAt = new Date();
  }

  /**
   * Replenishes stock levels.
   */
  public replenish(qty: number): void {
    if (qty <= 0) {
      throw new Error('Replenish quantity must be positive');
    }
    this.quantity += qty;
    this.updatedAt = new Date();
  }

  /**
   * Evaluates if stock falls below alert threshold levels.
   */
  public isStockLow(): boolean {
    return this.quantity <= this.lowStockThreshold;
  }
}
