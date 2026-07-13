export class SchedulingConcurrencyError extends Error {
  constructor(entityName: string, id: string | number) {
    super(`Concurrency collision detected for ${entityName} with ID ${id}. Stale version.`);
    this.name = 'SchedulingConcurrencyError';
  }
}

export class ShopCapacityExceededError extends Error {
  constructor(shopId: number) {
    super(`Shop with ID ${shopId} is currently at maximum capacity and cannot accept new orders.`);
    this.name = 'ShopCapacityExceededError';
  }
}

export class InsufficientInventoryError extends Error {
  constructor(shopId: number, itemType: string, variant: string, requested: number, available: number) {
    super(`Insufficient inventory for shop ${shopId}, item ${itemType} (${variant}). Requested: ${requested}, Available: ${available}`);
    this.name = 'InsufficientInventoryError';
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resource: string, id: string | number) {
    super(`${resource} with identifier ${id} was not found.`);
    this.name = 'ResourceNotFoundError';
  }
}
