/**
 * Phase 8A — Domain Entities & Aggregates Unit Tests
 *
 * Runs with:
 *   npx ts-node src/scheduling/tests/domain.test.ts
 */

import { ShopCapacity } from '../domain/entities/ShopCapacity';
import { Printer } from '../domain/entities/Printer';
import { QueueSlot } from '../domain/entities/QueueSlot';
import { MaintenanceWindow } from '../domain/entities/MaintenanceWindow';
import { InventoryItem } from '../domain/entities/InventoryItem';
import { PrinterCapabilities } from '../domain/value-objects/PrinterCapabilities';
import { PrinterStatus } from '../domain/enums/PrinterStatus';
import { QueueStatus } from '../domain/enums/QueueStatus';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}\n     ${err.stack || err.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function main(): void {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Phase 8A — Scheduling & Capacity Domain Unit Tests     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ───────────────────────────────────────────────────────────────────────────
  // ShopCapacity Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 ShopCapacity Aggregate');

  test('Construct capacity with default settings', () => {
    const capacity = new ShopCapacity(1001);
    assertEqual(capacity.shopId, 1001, 'shopId');
    assertEqual(capacity.maxParallelOrders, 5, 'default maxParallel');
    assertEqual(capacity.isAcceptingOrders, true, 'isAcceptingOrders default');
  });

  test('Capacity limits validation rules', () => {
    let threw = false;
    try {
      new ShopCapacity(1001, -5);
    } catch {
      threw = true;
    }
    assert(threw, 'should throw error on negative parallel orders');
  });

  test('Capacity accepts state changes', () => {
    const capacity = new ShopCapacity(1001);
    capacity.disableAcceptance();
    assertEqual(capacity.isAcceptingOrders, false, 'disabled acceptance');
    capacity.enableAcceptance();
    assertEqual(capacity.isAcceptingOrders, true, 'enabled acceptance');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PrinterCapabilities & Value Objects
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 PrinterCapabilities Value Object');

  test('Construct printer capabilities with valid options', () => {
    const caps = new PrinterCapabilities(20, true, true, ['A4', 'A3'], 120, ['plain', 'glossy']);
    assertEqual(caps.pagesPerMinute, 20, 'ppm');
    assertEqual(caps.duplexSupported, true, 'duplex');
    assertEqual(caps.colorSupported, true, 'color');
  });

  test('PrinterCapabilities checks compatibility', () => {
    const caps = new PrinterCapabilities(15, false, true, ['A4'], 80, ['plain']);
    
    // Check compatible request
    const isOk = caps.isCompatible({
      color: true,
      duplex: false,
      paperSize: 'A4',
      paperWeight: 80,
      mediaType: 'plain'
    });
    assert(isOk, 'should be compatible');

    // Incompatible: requests duplex but not supported
    const noDuplex = caps.isCompatible({ color: false, duplex: true, paperSize: 'A4' });
    assert(!noDuplex, 'should reject duplex');

    // Incompatible: requests paper size A3 not supported
    const noA3 = caps.isCompatible({ color: false, duplex: false, paperSize: 'A3' });
    assert(!noA3, 'should reject A3');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Printer Aggregate Root & Child Entities
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 Printer Aggregate Root');

  test('Construct printer with empty queue slots', () => {
    const caps = new PrinterCapabilities(20, true, true, ['A4'], 80, ['plain']);
    const printer = new Printer(1, 1001, 'Printer Alpha', PrinterStatus.AVAILABLE, caps);
    assertEqual(printer.name, 'Printer Alpha', 'name');
    assertEqual(printer.slots.length, 0, 'slots size');
  });

  test('Adding slot triggers queue ordering and duration calculations', () => {
    const caps = new PrinterCapabilities(10, true, true, ['A4'], 80, ['plain'], 30); // 10 ppm, 30s warmup
    const printer = new Printer(1, 1001, 'Printer Beta', PrinterStatus.AVAILABLE, caps);

    // 10 pages on 10 ppm printer = 1 minute print duration + 30s warmup = 1.5 minutes (90,000ms)
    const slot = new QueueSlot(null, 1001, 5001, 1, 0, new Date(), new Date(), 10, true, true, QueueStatus.PENDING);
    printer.addQueueSlot(slot);

    assertEqual(printer.slots.length, 1, '1 slot added');
    assertEqual(printer.slots[0].queuePosition, 1, 'queue position is 1');
    
    const start = printer.slots[0].estimatedStartTime.getTime();
    const end = printer.slots[0].estimatedCompletionTime.getTime();
    const durationSec = (end - start) / 1000;
    // 60s (print) + 30s (warmup) = 90s
    assertEqual(durationSec, 90, '90s duration calculated');
  });

  test('Overlapping scheduled MaintenanceWindow shifts slot start times', () => {
    const caps = new PrinterCapabilities(10, true, true, ['A4'], 80, ['plain'], 0); // 10 ppm, 0s warmup
    const printer = new Printer(1, 1001, 'Printer Gamma', PrinterStatus.AVAILABLE, caps);

    // Maintenance window scheduled 10 seconds from now for 5 minutes
    const now = Date.now();
    const maintStart = new Date(now + 10 * 1000);
    const maintEnd = new Date(now + 310 * 1000);
    const maint = new MaintenanceWindow(null, 1, maintStart, maintEnd, 'Rollers cleanup');
    printer.addMaintenanceWindow(maint);

    // Add slot needing 10 pages = 1 minute duration. 
    // Since it starts now, it ends in 60s. But that overlaps with maintenance window starting in 10s!
    // So the scheduler shifts it to start AFTER the maintenance window.
    const slot = new QueueSlot(null, 1001, 5002, 1, 0, new Date(), new Date(), 10, true, true, QueueStatus.PENDING);
    printer.addQueueSlot(slot);

    const actualStart = printer.slots[0].estimatedStartTime.getTime();
    // Start should be shifted to maintEnd (plus 1s buffer)
    const expectedShift = maintEnd.getTime() + 1000;
    assert(actualStart >= expectedShift, `should shift start to after maintenance. Got ${actualStart}, Expected >= ${expectedShift}`);
  });

  test('Removing slot triggers queue re-sorting and ETA shifts', () => {
    const caps = new PrinterCapabilities(10, true, true, ['A4'], 80, ['plain'], 0);
    const printer = new Printer(1, 1001, 'Printer Delta', PrinterStatus.AVAILABLE, caps);

    const slot1 = new QueueSlot(null, 1001, 6001, 1, 1, new Date(), new Date(), 10, true, true, QueueStatus.PENDING);
    const slot2 = new QueueSlot(null, 1001, 6002, 1, 2, new Date(), new Date(), 10, true, true, QueueStatus.PENDING);
    
    printer.addQueueSlot(slot1);
    printer.addQueueSlot(slot2);
    assertEqual(printer.slots.length, 2, '2 slots added');

    // Remove slot 1
    printer.removeQueueSlot(6001);
    assertEqual(printer.slots.length, 1, '1 slot remaining');
    assertEqual(printer.slots[0].orderId, 6002, 'remaining slot is slot 2');
    assertEqual(printer.slots[0].queuePosition, 1, 'slot 2 promoted to position 1');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // InventoryItem Tests
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📦 InventoryItem Aggregate');

  test('Construct item and deduct/replenish quantities', () => {
    const item = new InventoryItem(null, 1001, 'paper', 'A4', 500, 'sheets', 100);
    assertEqual(item.quantity, 500, 'initial qty');
    
    assert(item.hasSufficientStock(200) === true, 'has stock');
    item.deduct(200);
    assertEqual(item.quantity, 300, 'deducted qty');
    assertEqual(item.isStockLow(), false, 'stock not low');

    item.deduct(250);
    assertEqual(item.quantity, 50, 'low qty');
    assertEqual(item.isStockLow(), true, 'stock level low alert triggered');

    item.replenish(200);
    assertEqual(item.quantity, 250, 'replenished qty');
    assertEqual(item.isStockLow(), false, 'restored level');
  });

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('──────────────────────────────────────────────────────────\n');

  if (failed > 0) throw new Error('Test suite failed');
}

main();
