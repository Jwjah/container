# RFC-008: Production Scheduling, Shop Capacity & Inventory Management

## Executive Summary
This RFC defines the architecture, domain models, database schema, algorithms, and implementation roadmap for the **Production Scheduling, Shop Capacity & Inventory Management** bounded context (the `scheduling` sub-system) of CampusPrint.

This subsystem ensures production reliability by tracking printer availability, capacity load, paper/ink inventory, and maintenance windows. It implements dynamic scheduling algorithms to assign print jobs to optimal printers, predict accurate estimated completion times (ETAs), manage queues, and prevent shop overloading.

---

## 1. Business Motivation
As CampusPrint scales, unrestricted order acceptance leads to print queue congestion, paper/ink shortages, and missed delivery SLAs. To guarantee high service levels, the marketplace requires real-time resource awareness to:
1. **Prevent Overload**: Automatically block order routing to shops exceeding their capacity thresholds.
2. **Provide Accurate ETAs**: Give students realistic completion times based on live queues, printer speeds, and active workloads.
3. **Manage Shop Inventory**: Monitor paper sheets and ink levels, automatically checking stock before accepting orders.
4. **Optimize Resource Allocation**: Automatically route print files to the best printer based on color, duplex capabilities, and current backlog.

---

## 2. Domain Driven Design (DDD)

### A. Context Map & Boundaries
The `scheduling` context is a **downstream subscriber** to the `orders`, `payments`, and `print_jobs` contexts. It listens to domain events (e.g. `ORDER_CREATED`, `PRINT_JOB_CREATED`, `PRINT_STARTED`) to maintain its capacity allocations and queue projections.

```
+------------------+                    +---------------------+
|  Orders Context  | --[Event Stream]-->| Scheduling Context  |
+------------------+                    +---------------------+
                                                   |
                                                   v
                                        +---------------------+
                                        |  Inventory Context  |
                                        +---------------------+
```

### B. Ubiquitous Language
*   **Printer**: A physical hardware device registered under a shop that processes print jobs.
*   **Capacity Limit**: The maximum number of pages or jobs a shop can commit to process in parallel.
*   **Queue Slot**: An allocated time window on a specific printer representing an order's print duration.
*   **Inventory Item**: Tracked supplies (Paper size sheets, Ink color/mono levels) necessary to fulfill printing.
*   **Overload Gate**: A safety control that flags a shop as unavailable when active load exceeds capacity limits.
*   **Print Speed**: Measured in Pages Per Minute (PPM) for a specific printer.

### C. Aggregates & Boundaries

#### 1. ShopCapacity Aggregate
*   **Aggregate Root**: `ShopCapacity`
*   **Entities**: `ShopCapacity`
*   **Value Objects**: `WorkingHours`, `OverloadThreshold`
*   **Domain Events**: `ShopCapacityExceeded`, `ShopAvailabilityChanged`

#### 2. Printer Aggregate
*   **Aggregate Root**: `Printer`
*   **Entities**: `Printer`, `MaintenanceWindow`
*   **Value Objects**: `PrinterCapabilities` (Speed, Duplex, Color support)
*   **Domain Events**: `PrinterRegistered`, `PrinterStatusChanged`, `MaintenanceScheduled`

#### 3. QueueSlot Aggregate
*   **Aggregate Root**: `QueueSlot`
*   **Entities**: `QueueSlot`
*   **Value Objects**: `TimeWindow` (Start time, End time)
*   **Domain Events**: `JobScheduled`, `JobQueuePositionShifted`, `EtaRecalculated`

#### 4. Inventory Supply Aggregate
*   **Aggregate Root**: `InventoryItem`
*   **Entities**: `InventoryItem`
*   **Value Objects**: `StockThreshold`
*   **Domain Events**: `InventoryAllocated`, `StockLevelLow`, `InventoryReplenished`

---

## 3. Core Algorithms

### A. Estimated Time of Completion (ETC) & Printer Assignment
For a new print job requiring $P$ pages with settings (Color: $C$, Duplex: $D$):
1. **Filter Compatible Printers**: Locate all active printers in the shop that support the color and duplex requirements.
2. **Calculate Print Duration**: 
   $$Duration = \frac{P}{Printer.PagesPerMinute}$$
   If Duplex is requested and the printer does not support automatic duplexing, double the duration to account for manual reloading.
3. **Queue Slot Search (ECT Algorithm)**:
   For each compatible printer, check its scheduled queue slots:
   $$EarliestStart = \max(Now, \text{EndTime of last scheduled slot})$$
   Verify if a maintenance window overlaps with this time. If so, push the $EarliestStart$ to after the maintenance window.
   $$EarliestCompletion = EarliestStart + Duration$$
4. **Optimal Assignment**: Assign the job to the printer that yields the minimum $EarliestCompletion$ time.

### B. Overload Protection
A shop is flagged as overloaded (`isAcceptingOrders = false`) if:
$$\text{CurrentActiveJobsCount} \ge \text{MaxParallelOrders}$$
OR
$$\text{TotalQueueWaitTime} \ge \text{ShopOverloadWaitThreshold} \text{ (e.g. 2 hours)}$$

### C. Inventory Allocation Check
When a job is requested:
*   Ensure $\text{PaperStock[Size]} \ge P$.
*   Estimate ink consumption:
    $$\text{InkRequired} = P \times \text{AverageInkUsagePerPage} \text{ (e.g. 0.05\% per page)}$$
    Ensure $\text{InkLevel[Type]} \ge \text{InkRequired}$.
*   If checks pass, decrement stock levels. If levels fall below `lowStockThreshold`, emit `StockLevelLow` alert event.

---

## 4. Database Schema Design (MySQL & SQLite Compatible)

### A. `scheduling_shops_capacity`
Tracks overall shop thresholds and running loads.
```sql
CREATE TABLE IF NOT EXISTS scheduling_shops_capacity (
  shop_id INTEGER PRIMARY KEY,
  max_parallel_orders INTEGER NOT NULL DEFAULT 5,
  current_active_orders INTEGER NOT NULL DEFAULT 0,
  overload_wait_threshold_seconds INTEGER NOT NULL DEFAULT 7200, -- 2 hours
  is_accepting_orders INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### B. `scheduling_printers`
Stores physical printing capabilities.
```sql
CREATE TABLE IF NOT EXISTS scheduling_printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'color', 'mono'
  status TEXT NOT NULL, -- 'available', 'maintenance', 'offline'
  duplex_supported INTEGER NOT NULL DEFAULT 1,
  pages_per_minute INTEGER NOT NULL DEFAULT 20,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES scheduling_shops_capacity(shop_id) ON DELETE CASCADE
);
```

### C. `scheduling_printer_maintenance`
Holds downtime planning records.
```sql
CREATE TABLE IF NOT EXISTS scheduling_printer_maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER NOT NULL,
  start_time TEXT NOT NULL, -- ISO Date String
  end_time TEXT NOT NULL, -- ISO Date String
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (printer_id) REFERENCES scheduling_printers(id) ON DELETE CASCADE
);
```

### D. `scheduling_print_queue`
Manages active assignments and time windows.
```sql
CREATE TABLE IF NOT EXISTS scheduling_print_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL UNIQUE,
  printer_id INTEGER DEFAULT NULL,
  queue_position INTEGER NOT NULL DEFAULT 0,
  estimated_start_time TEXT NOT NULL, -- ISO Date String
  estimated_completion_time TEXT NOT NULL, -- ISO Date String
  pages_count INTEGER NOT NULL,
  duplex INTEGER NOT NULL DEFAULT 0,
  color INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, -- 'pending', 'printing', 'completed', 'cancelled'
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES scheduling_shops_capacity(shop_id) ON DELETE CASCADE,
  FOREIGN KEY (printer_id) REFERENCES scheduling_printers(id) ON DELETE SET NULL
);
```

### E. `scheduling_inventory`
Monitors sheets and consumable levels.
```sql
CREATE TABLE IF NOT EXISTS scheduling_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL,
  item_type TEXT NOT NULL, -- 'paper_a4', 'paper_a3', 'ink_color', 'ink_mono'
  quantity REAL NOT NULL DEFAULT 0.0,
  unit TEXT NOT NULL, -- 'sheets', 'percentage'
  low_stock_threshold REAL NOT NULL DEFAULT 100.0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shop_id, item_type),
  FOREIGN KEY (shop_id) REFERENCES scheduling_shops_capacity(shop_id) ON DELETE CASCADE
);
```

---

## 5. API Design

### GET `/api/scheduling/shops/:shopId/capacity`
Returns current capacity usage, overload flag, and queue counts.
*   **Auth**: Student (Own order shop), Shop (Own shop), Admin
*   **Response DTO**:
```json
{
  "shopId": 20,
  "maxParallelOrders": 5,
  "currentActiveOrders": 2,
  "isAcceptingOrders": true,
  "totalQueuedPages": 45,
  "estimatedWaitTimeSeconds": 135
}
```

### GET `/api/scheduling/shops/:shopId/printers`
Exposes lists of registered printers.
*   **Auth**: Shop (Own shop), Admin
*   **Response DTO**:
```json
[
  {
    "id": 1,
    "name": "HP LaserJet Pro",
    "type": "mono",
    "status": "available",
    "duplexSupported": true,
    "pagesPerMinute": 30
  }
]
```

### GET `/api/scheduling/orders/:orderId/eta`
Exposes the estimated completion time and queue position.
*   **Auth**: Customer (Own order), Shop (Own shop), Admin
*   **Response DTO**:
```json
{
  "orderId": 9001,
  "queuePosition": 3,
  "estimatedStartTime": "2026-07-13T08:00:00.000Z",
  "estimatedCompletionTime": "2026-07-13T08:05:00.000Z"
}
```

### POST `/api/scheduling/shops/:shopId/inventory/replenish`
Replenishes supply stocks.
*   **Auth**: Shop (Own shop), Admin
*   **Request Body**:
```json
{
  "itemType": "paper_a4",
  "quantity": 1000
}
```

---

## 6. Implementation Roadmap

```
Phase 8A (Schema & Entities) ──► Phase 8B (Repositories) ──► Phase 8C (Scheduling Engine)
                                                                    │
Phase 8F (Observability) ◄── Phase 8E (REST APIs) ◄── Phase 8D (Workers & Sync)
       │
       ▼
Phase 8G (Chaos & Load Testing)
```

---

## 7. LLM Prompts for Phase-by-Phase Execution

### Phase 8A: Database Schema, Domain Entities, Enums, and Repository Interfaces
```markdown
You are implementing Phase 8A of RFC-008: Database Schema, Domain Entities, Enums, and Repository Interfaces.

Requirements:
1. Create enums for PrinterType ('color', 'mono'), PrinterStatus ('available', 'maintenance', 'offline'), QueueStatus ('pending', 'printing', 'completed', 'cancelled'), and InventoryItemType ('paper_a4', 'paper_a3', 'ink_color', 'ink_mono').
2. Implement core Domain Entities and Aggregate Roots in strict TypeScript:
   - ShopCapacity (domain/entities/ShopCapacity.ts)
   - Printer (domain/entities/Printer.ts)
   - MaintenanceWindow (domain/entities/MaintenanceWindow.ts)
   - QueueSlot (domain/entities/QueueSlot.ts)
   - InventoryItem (domain/entities/InventoryItem.ts)
3. Write clean repository interfaces:
   - IShopCapacityRepository.ts
   - IPrinterRepository.ts
   - IQueueSlotRepository.ts
   - IInventoryRepository.ts
4. Add the SQLite/MySQL schema definitions for scheduling_shops_capacity, scheduling_printers, scheduling_printer_maintenance, scheduling_print_queue, and scheduling_inventory tables to server/src/migrations/migrate.js. Run the migrations.
5. Create mock unit tests validating entities construction and validation rules. Do not implement database repositories or business logic services yet.
```

### Phase 8B: Repository Implementations, Transactions, Concurrency, and Optimistic Locking
```markdown
You are implementing Phase 8B of RFC-008: Repository Implementations & Persistence.

Requirements:
1. Implement the repository interfaces created in Phase 8A using mysql2 / better-sqlite3 database execution layers:
   - SqlShopCapacityRepository.ts
   - SqlPrinterRepository.ts
   - SqlQueueSlotRepository.ts
   - SqlInventoryRepository.ts
2. Ensure concurrency safety via optimistic locking on update operations (e.g. "WHERE version = ?").
3. Wrap transactional updates to ensure atomic updates (e.g., deducting inventory and queueing a slot must commit or rollback together).
4. Translate database deadlock or lock timeouts to custom domain execution errors.
5. Write complete integration tests validating concurrent saves, version check updates, and rollback behaviors under SQLite mode.
```

### Phase 8C: Scheduling Engine, Capacity Calculator, Queue Estimator, and ETA Prediction
```markdown
You are implementing Phase 8C of RFC-008: Scheduling Engine & Capacity Calculations.

Requirements:
1. Implement SchedulingEngine.ts responsible for:
   - Assignment: Selecting the optimal compatible printer based on Earliest Completion Time (ECT).
   - Duration Calculation: Factoring Pages Per Minute, color requirements, and duplex adjustments.
   - Queue Estimation: Summing preceding slot durations.
   - Maintenance awareness: Shifting ETA projections to start after scheduled maintenance blocks.
2. Implement CapacityCalculator.ts to evaluate if a shop is overloaded based on active job counts or average wait times.
3. Write unit tests validating ECT printer selection, wait time projections, duplex adjustments, and maintenance window shifting behaviors.
```

### Phase 8D: Background Workers, Capacity Projection, and Inventory Synchronization
```markdown
You are implementing Phase 8D of RFC-008: Background Workers & Event Processing.

Requirements:
1. Create a background event listener (SchedulingEventWorker.ts) utilizing IProjectionEventSource to process:
   - ORDER_CREATED: Checks inventory availability, runs SchedulingEngine to assign printer, creates queue slot.
   - PRINT_STARTED: Updates queue status to 'printing' and updates timestamps.
   - PRINT_COMPLETED / PRINT_FAILED: Marks queue status, releases active capacity slot.
2. Implement safety policies for retry backoffs on transient locking collisions.
3. Expose worker status, cycle counters, and current queue lag.
4. Write integration tests showing event-driven capacity updates, automatic out-of-stock event warnings, and printer queue slot creation.
```

### Phase 8E: REST APIs, DTOs, Authorization, and Validations
```markdown
You are implementing Phase 8E of RFC-008: REST APIs & Controller Layer.

Requirements:
1. Create API controllers exposing read-only scheduling details and administrative commands:
   - GET /api/scheduling/shops/:shopId/capacity
   - GET /api/scheduling/shops/:shopId/printers
   - GET /api/scheduling/orders/:orderId/eta
   - POST /api/scheduling/shops/:shopId/inventory/replenish
2. Enforce standard authentication and role authorizations:
   - Students can only view tracking/ETAs of their own orders.
   - Shops can manage their own printers and inventory.
   - Admins can query and manage all resources.
3. Use strict request parameter validation (uuids, integers, positive limits).
4. Write Express route files and integration tests asserting access checks, 404/403 HTTP codes, and DTO output contracts.
```

### Phase 8F: Observability, Replay, Metrics, and Prometheus Health Checks
```markdown
You are implementing Phase 8F of RFC-008: Observability & Replay Tooling.

Requirements:
1. Implement SchedulingMetricsService.ts to track Prom-compatible values (processed_events_total, active_printers_count, queue_lag_seconds).
2. Integrate structured JSON logs containing correlationId, requestId, printerId, and processing duration.
3. Implement a ReplayService to pause worker, wipe scheduling tables, re-run historic event streams, and rebuild queues.
4. Add readiness health checks confirming database connectivity, active worker loops, and inventory warning levels.
5. Create unit/integration tests confirming Prometheus format string outputs and replay rebuild accuracy.
```

### Phase 8G: Testing, Load Testing, Chaos Testing, and Production Hardening
```markdown
You are implementing Phase 8G of RFC-008: Testing & Hardening.

Requirements:
1. Create comprehensive simulation tests:
   - Load Testing: Simulate concurrent workloads of 100, 500, and 1000 events per second. Verify queue lag limits and database performance.
   - Chaos Testing: Inject failure scenarios (database connection drops, worker crash mid-transaction) and verify state rollback and self-healing.
2. Complete a production checklist confirming API security gates, DTO serialization compliance, and error boundaries.
3. Build a consolidated test execution script and verify all Phase 8 test suites pass cleanly.
```
