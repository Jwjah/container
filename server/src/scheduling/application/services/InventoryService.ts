import { IInventoryRepository } from '../../interfaces/IInventoryRepository';
import { InventoryItem } from '../../domain/entities/InventoryItem';
import { InsufficientInventoryError, ResourceNotFoundError } from '../../domain/errors/SchedulingErrors';
import db from '../../../config/database';

/**
 * InventoryService — manages stock validations, reservations, releases, and replenishment.
 *
 * RFC-008 Refinement 1 & 5 Specification (Separate subdomain utilizing generic inventory items)
 */
export class InventoryService {
  private readonly INK_USAGE_PER_PAGE = 0.05; // 0.05% ink per page

  constructor(private readonly inventoryRepo: IInventoryRepository) {}

  /**
   * Evaluates if a shop has sufficient paper sheets and ink reservoirs to process a print order.
   */
  public async validateStock(
    shopId: number,
    paperSize: string,
    pagesCount: number,
    color: boolean,
    connection?: any
  ): Promise<boolean> {
    const executor = connection || db;

    // 1. Verify Paper Stock
    const paper = await this.inventoryRepo.findByShopAndItem(shopId, 'paper', paperSize, executor);
    if (!paper || !paper.hasSufficientStock(pagesCount)) {
      return false;
    }

    // 2. Verify Ink Stock
    const inkVariant = color ? 'Color' : 'Black';
    const inkRequired = pagesCount * this.INK_USAGE_PER_PAGE;
    const ink = await this.inventoryRepo.findByShopAndItem(shopId, 'ink', inkVariant, executor);
    if (!ink || !ink.hasSufficientStock(inkRequired)) {
      return false;
    }

    return true;
  }

  /**
   * Reserves paper and ink supplies for an incoming order. Deducts stock quantities.
   */
  public async reserveInventory(
    shopId: number,
    paperSize: string,
    pagesCount: number,
    color: boolean,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;

    // Retrieve paper
    const paper = await this.inventoryRepo.findByShopAndItem(shopId, 'paper', paperSize, executor);
    if (!paper) {
      throw new ResourceNotFoundError('Paper InventoryItem', `${shopId}-${paperSize}`);
    }
    if (!paper.hasSufficientStock(pagesCount)) {
      throw new InsufficientInventoryError(shopId, 'paper', paperSize, pagesCount, paper.quantity);
    }

    // Retrieve ink
    const inkVariant = color ? 'Color' : 'Black';
    const inkRequired = pagesCount * this.INK_USAGE_PER_PAGE;
    const ink = await this.inventoryRepo.findByShopAndItem(shopId, 'ink', inkVariant, executor);
    if (!ink) {
      throw new ResourceNotFoundError('Ink InventoryItem', `${shopId}-${inkVariant}`);
    }
    if (!ink.hasSufficientStock(inkRequired)) {
      throw new InsufficientInventoryError(shopId, 'ink', inkVariant, inkRequired, ink.quantity);
    }

    // Deduct stock
    paper.deduct(pagesCount);
    ink.deduct(inkRequired);

    // Save updates
    await this.inventoryRepo.update(paper, executor);
    await this.inventoryRepo.update(ink, executor);

    // Alert low stock warnings
    if (paper.isStockLow()) {
      console.warn(`🚨 [InventoryService] Paper stock low for shop ${shopId} (${paperSize}). Qty: ${paper.quantity}`);
    }
    if (ink.isStockLow()) {
      console.warn(`🚨 [InventoryService] Ink stock low for shop ${shopId} (${inkVariant}). Qty: ${ink.quantity}`);
    }
  }

  /**
   * Releases reserved supplies on order cancellation. Restores stock levels.
   */
  public async releaseInventory(
    shopId: number,
    paperSize: string,
    pagesCount: number,
    color: boolean,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;

    const paper = await this.inventoryRepo.findByShopAndItem(shopId, 'paper', paperSize, executor);
    if (paper) {
      paper.replenish(pagesCount);
      await this.inventoryRepo.update(paper, executor);
    }

    const inkVariant = color ? 'Color' : 'Black';
    const inkRequired = pagesCount * this.INK_USAGE_PER_PAGE;
    const ink = await this.inventoryRepo.findByShopAndItem(shopId, 'ink', inkVariant, executor);
    if (ink) {
      ink.replenish(inkRequired);
      await this.inventoryRepo.update(ink, executor);
    }
  }

  /**
   * Replenishes stock levels of paper or ink.
   */
  public async replenishInventory(
    shopId: number,
    type: string,
    variant: string,
    quantity: number,
    connection?: any
  ): Promise<void> {
    const executor = connection || db;
    let item = await this.inventoryRepo.findByShopAndItem(shopId, type, variant, executor);

    if (!item) {
      // Create new inventory item entry if it doesn't exist
      const unit = type === 'paper' ? 'sheets' : 'percentage';
      item = new InventoryItem(null, shopId, type, variant, quantity, unit, 100);
      await this.inventoryRepo.create(item, executor);
    } else {
      item.replenish(quantity);
      await this.inventoryRepo.update(item, executor);
    }
  }
}
