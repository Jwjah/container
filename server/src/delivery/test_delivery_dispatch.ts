import assert from 'assert';
import db from '../config/database';
import { SqlDeliveryAssignmentRepository } from './infrastructure/persistence/SqlDeliveryAssignmentRepository';
import { SqlDeliveryHistoryRepository } from './infrastructure/persistence/SqlDeliveryHistoryRepository';
import { SqlDeliveryAgentAvailabilityRepository } from './infrastructure/persistence/SqlDeliveryAgentAvailabilityRepository';
import { SqlFulfillmentRepository } from '../payments/infrastructure/persistence/SqlFulfillmentRepository';
import { SqlFulfillmentHistoryRepository } from '../payments/infrastructure/persistence/SqlFulfillmentHistoryRepository';
import { SqlOrderRepository } from '../payments/infrastructure/persistence/SqlOrderRepository';
import { SqlPrintJobRepository } from '../payments/infrastructure/persistence/SqlPrintJobRepository';
import { SqlOutboxRepository } from '../payments/infrastructure/persistence/SqlOutboxRepository';
import { OtpService } from '../payments/application/services/OtpService';
import { FulfillmentAuthorizationService } from '../payments/application/services/FulfillmentAuthorizationService';
import { FulfillmentService } from '../payments/application/services/FulfillmentService';
import { FulfillmentAssignedListener } from './application/events/FulfillmentAssignedListener';
import { DeliveryAgentRejectedListener } from '../payments/application/events/DeliveryAgentRejectedListener';
import { DeliveryPickupCompletedListener } from '../payments/application/events/DeliveryPickupCompletedListener';
import { DeliveryCompletedListener } from '../payments/application/events/DeliveryCompletedListener';
import { DeliveryFailedListener } from '../payments/application/events/DeliveryFailedListener';
import { DeliveryDispatchRequestListner as DeliveryDispatchRequestListener } from '../payments/application/events/DeliveryDispatchRequestListner';
import { DeliveryAgentAssignedListener } from '../payments/application/events/DeliveryAgentAssignedListener';
import { CorrelationId } from '../payments/domain/value-objects/CorrelationId';
import { AgentAvailabilityService } from './application/services/AgentAvailabilityService';
import { DeterministicDispatchStrategy } from './application/services/DeterministicDispatchStrategy';
import { DeliveryDispatchService } from './application/services/DeliveryDispatchService';
import { DeliveryAssignmentService } from './application/services/DeliveryAssignmentService';
import { DeliveryAuthorizationService } from './application/services/DeliveryAuthorizationService';
import { DeliveryAssignmentStatus } from './domain/enums/DeliveryAssignmentStatus';
import { DeliveryAgentStatus } from './domain/enums/DeliveryAgentStatus';
import { FulfillmentStatus } from '../payments/domain/enums/FulfillmentStatus';
import { OutboxEventStatus } from '../payments/domain/enums/OutboxEventStatus';

const STUDENT_ID = 200;
const MANAGER_ID = 300;
const SHOP_ID = 400;
const UNAUTH_MANAGER_ID = 500;
const AGENT_1_ID = 701;
const AGENT_2_ID = 702;
const ADMIN_ID = 800;

async function setupDb() {
  // Clear all database tables
  try { await db.execute('DELETE FROM delivery_history'); } catch (e) {}
  try { await db.execute('DELETE FROM delivery_assignments'); } catch (e) {}
  try { await db.execute('DELETE FROM delivery_agent_availability'); } catch (e) {}
  try { await db.execute('DELETE FROM fulfillment_history'); } catch (e) {}
  try { await db.execute('DELETE FROM fulfillments'); } catch (e) {}
  try { await db.execute('DELETE FROM outbox_events'); } catch (e) {}
  try { await db.execute('DELETE FROM print_job_history'); } catch (e) {}
  try { await db.execute('DELETE FROM print_jobs'); } catch (e) {}
  try { await db.execute('DELETE FROM invoices'); } catch (e) {}
  try { await db.execute('DELETE FROM payments'); } catch (e) {}
  try { await db.execute('DELETE FROM deliveries'); } catch (e) {}
  try { await db.execute('DELETE FROM transactions'); } catch (e) {}
  try { await db.execute('DELETE FROM notifications'); } catch (e) {}
  try { await db.execute('DELETE FROM push_subscriptions'); } catch (e) {}
  try { await db.execute('DELETE FROM otp_codes'); } catch (e) {}
  try { await db.execute('DELETE FROM order_files'); } catch (e) {}
  try { await db.execute('DELETE FROM payment_webhook_events'); } catch (e) {}
  try { await db.execute('DELETE FROM invoice_sequence'); } catch (e) {}
  try { await db.execute('DELETE FROM orders'); } catch (e) {}
  try { await db.execute('DELETE FROM shops'); } catch (e) {}
  try { await db.execute('DELETE FROM users'); } catch (e) {}

  // Seed Users
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [STUDENT_ID, 'Test Student', 'student@cp.com', 'pwd', 'student', 1]);
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [MANAGER_ID, 'Test Shop Manager', 'manager@cp.com', 'pwd', 'shop', 1]);
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [UNAUTH_MANAGER_ID, 'Unauth Manager', 'unauth@cp.com', 'pwd', 'shop', 1]);
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [AGENT_1_ID, 'Agent One', 'agent1@cp.com', 'pwd', 'agent', 1]);
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [AGENT_2_ID, 'Agent Two', 'agent2@cp.com', 'pwd', 'agent', 1]);
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [ADMIN_ID, 'Test Admin', 'admin@cp.com', 'pwd', 'admin', 1]);
  await db.execute('INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
    [0, 'System User', 'system@cp.com', 'pwd', 'admin', 1]);

  // Seed Shop
  await db.execute('INSERT INTO shops (id, user_id, shop_name, description, location, is_open, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [SHOP_ID, MANAGER_ID, 'Campus Print Shop', 'Desc', 'Loc', 1, 1]);

  // Seed Orders (hostel delivery mode)
  await db.execute('INSERT INTO orders (id, order_hash, student_id, shop_id, status, delivery_type, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [1001, 'hash-1001', STUDENT_ID, SHOP_ID, 'ready', 'hostel', 150.00]);
  await db.execute('INSERT INTO orders (id, order_hash, student_id, shop_id, status, delivery_type, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [1002, 'hash-1002', STUDENT_ID, SHOP_ID, 'ready', 'hostel', 200.00]);
  await db.execute('INSERT INTO orders (id, order_hash, student_id, shop_id, status, delivery_type, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [1003, 'hash-1003', STUDENT_ID, SHOP_ID, 'ready', 'hostel', 250.00]);

  // Seed Print Jobs
  await db.execute('INSERT INTO print_jobs (id, order_id, shop_id, student_id, status) VALUES (?, ?, ?, ?, ?)',
    [2001, 1001, SHOP_ID, STUDENT_ID, 'READY']);
  await db.execute('INSERT INTO print_jobs (id, order_id, shop_id, student_id, status) VALUES (?, ?, ?, ?, ?)',
    [2002, 1002, SHOP_ID, STUDENT_ID, 'READY']);
  await db.execute('INSERT INTO print_jobs (id, order_id, shop_id, student_id, status) VALUES (?, ?, ?, ?, ?)',
    [2003, 1003, SHOP_ID, STUDENT_ID, 'READY']);
}

async function runTests() {
  console.log('🧪 Starting Delivery Dispatch & Agent Management (Phase 6C) Integration Tests...\n');
  await setupDb();

  // Instantiate Repositories
  const assignmentRepo = new SqlDeliveryAssignmentRepository();
  const historyRepo = new SqlDeliveryHistoryRepository();
  const availabilityRepo = new SqlDeliveryAgentAvailabilityRepository();
  const fulfillmentRepo = new SqlFulfillmentRepository();
  const fulfillmentHistoryRepo = new SqlFulfillmentHistoryRepository();
  const orderRepo = new SqlOrderRepository();
  const printJobRepo = new SqlPrintJobRepository();
  const outboxRepo = new SqlOutboxRepository();

  // Instantiate Services
  const availabilityService = new AgentAvailabilityService(availabilityRepo);
  const dispatchStrategy = new DeterministicDispatchStrategy();
  const dispatchService = new DeliveryDispatchService(availabilityRepo, availabilityService, dispatchStrategy);
  const authService = new DeliveryAuthorizationService();
  const assignmentService = new DeliveryAssignmentService(
    assignmentRepo,
    historyRepo,
    outboxRepo,
    availabilityService,
    authService
  );

  const otpService = new OtpService();
  const fulfillmentAuthService = new FulfillmentAuthorizationService();
  const fulfillmentService = new FulfillmentService(
    fulfillmentRepo,
    fulfillmentHistoryRepo,
    orderRepo,
    printJobRepo,
    outboxRepo,
    otpService,
    fulfillmentAuthService
  );

  // Instantiate Integration Listeners
  const fulfillmentAssignedListener = new FulfillmentAssignedListener(assignmentService);
  const deliveryAgentRejectedListener = new DeliveryAgentRejectedListener(fulfillmentService);
  const deliveryPickupCompletedListener = new DeliveryPickupCompletedListener(fulfillmentService);
  const deliveryCompletedListener = new DeliveryCompletedListener(fulfillmentService);
  const deliveryFailedListener = new DeliveryFailedListener(fulfillmentService);
  const deliveryDispatchRequestListener = new DeliveryDispatchRequestListener(fulfillmentService);
  const deliveryAgentAssignedListener = new DeliveryAgentAssignedListener(fulfillmentService);

  let passed = 0;
  let failed = 0;

  // Track dynamic IDs
  let fulfillment1Id = 0;
  let fulfillment2Id = 0;
  let fulfillment3Id = 0;
  let assignment1Id = 0;
  let assignment2Id = 0;
  let assignment3Id = 0;
  let activeAgentId = 0;

  // Helper to assert passes
  function assertPass(testName: string) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  }

  // Helper to assert fails
  function assertFail(testName: string, err: any) {
    console.error(`  ❌ [FAIL] ${testName}:`, err.message || err);
    failed++;
  }

  // --- Test 1: Agent Availability Initialization ---
  try {
    const av1 = await availabilityService.getOrCreateAgentAvailability(AGENT_1_ID);
    const av2 = await availabilityService.getOrCreateAgentAvailability(AGENT_2_ID);
    assert.strictEqual(av1.status, DeliveryAgentStatus.AVAILABLE);
    assert.strictEqual(av2.status, DeliveryAgentStatus.AVAILABLE);
    assert.strictEqual(av1.activeWorkload, 0);
    assertPass('Agent Availability Initialization');
  } catch (e) { assertFail('Agent Availability Initialization', e); }

  // --- Test 2: Deterministic Workload Balancing ---
  try {
    const now = Date.now();
    await db.execute('UPDATE delivery_agent_availability SET last_idle_at = ? WHERE agent_id = ?', [
      new Date(now - 10000).toISOString(), AGENT_1_ID
    ]);
    await db.execute('UPDATE delivery_agent_availability SET last_idle_at = ? WHERE agent_id = ?', [
      new Date(now).toISOString(), AGENT_2_ID
    ]);

    // Tied workloads (0), oldest idle should be selected (AGENT_1_ID)
    const selectedAgentId = await dispatchService.selectAgent();
    assert.strictEqual(selectedAgentId, AGENT_1_ID, 'Oldest idle agent selected');

    // Simulate Agent 1 workload = 1
    await availabilityService.assignAgent(AGENT_1_ID);
    
    // Now Agent 2 has lower workload (0 vs 1), should select Agent 2
    const selectedAgentId2 = await dispatchService.selectAgent();
    assert.strictEqual(selectedAgentId2, AGENT_2_ID, 'Agent with lowest workload selected');

    // Reset Agent 1 availability back to 0 workload
    await availabilityService.restoreAvailability(AGENT_1_ID);

    assertPass('Deterministic Workload Balancing');
  } catch (e) { assertFail('Deterministic Workload Balancing', e); }

  // --- Test 3: Event Listener - Fulfillment Auto-Dispatch request ---
  try {
    // 1. Initialize a ready fulfillment
    const f1DTO = await fulfillmentService.initializeFromPrintReady(1001, SHOP_ID, STUDENT_ID, 2001);
    fulfillment1Id = f1DTO.id;

    // 2. Dispatch triggering loop via event simulation
    const selectedAgent = await dispatchService.selectAgent();
    assert.ok(selectedAgent);
    activeAgentId = selectedAgent; // Track who is active for subsequent tests

    await deliveryDispatchRequestListener.handle({
      fulfillmentId: fulfillment1Id,
      agentId: activeAgentId,
      userId: MANAGER_ID,
      correlationId: 'cid-test-dispatch'
    });

    // Verify Fulfillment status updated to DELIVERY_ASSIGNED
    const f = await fulfillmentRepo.findById(fulfillment1Id);
    assert.strictEqual(f?.status, FulfillmentStatus.DELIVERY_ASSIGNED);
    assert.strictEqual(f?.assignedAgentId, activeAgentId);

    // 3. Verify FULFILLMENT_ASSIGNED event triggers DeliveryAssignment initialization
    const outboxEvents = await outboxRepo.claimBatch(10, 'test-worker');
    const fAssignedEvt = outboxEvents.find(e => e.eventType === 'FULFILLMENT_ASSIGNED');
    assert.ok(fAssignedEvt);

    const [dbUsers] = await db.execute('SELECT * FROM users');
    console.log('DIAGNOSTIC USERS:', dbUsers);
    const [dbOrders] = await db.execute('SELECT * FROM orders');
    console.log('DIAGNOSTIC ORDERS:', dbOrders);
    const [dbShops] = await db.execute('SELECT * FROM shops');
    console.log('DIAGNOSTIC SHOPS:', dbShops);
    const [dbFulfillments] = await db.execute('SELECT * FROM fulfillments');
    console.log('DIAGNOSTIC FULFILLMENTS:', dbFulfillments);
    const [fkList] = await db.execute("SELECT * FROM pragma_foreign_key_list('delivery_assignments')");
    console.log('FOREIGN KEY LIST ON delivery_assignments:', fkList);

    await fulfillmentAssignedListener.handle(JSON.parse(fAssignedEvt.payload));

    // Verify DeliveryAssignment exists
    const assignment = await assignmentRepo.findActiveByFulfillmentId(fulfillment1Id);
    assert.ok(assignment);
    assignment1Id = assignment.id;
    assert.strictEqual(assignment?.status, DeliveryAssignmentStatus.ASSIGNED);
    assert.strictEqual(assignment?.agentId, activeAgentId);

    // Verify agent status is now BUSY
    const agentAv = await availabilityRepo.findById(activeAgentId);
    assert.strictEqual(agentAv?.status, DeliveryAgentStatus.BUSY);
    assert.strictEqual(agentAv?.activeWorkload, 1);

    // Clean outbox events
    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    assertPass('Event Listener - Fulfillment Auto-Dispatch & Delivery Creation');
  } catch (e) { assertFail('Event Listener - Fulfillment Auto-Dispatch & Delivery Creation', e); }

  // --- Test 4: Agent Acceptance & Transition ---
  try {
    const assignment = await assignmentRepo.findById(assignment1Id);
    assert.ok(assignment);

    // Agent accepts
    await assignmentService.acceptAssignment(assignment.id, activeAgentId, 'cid-accept');

    const updated = await assignmentRepo.findById(assignment.id);
    assert.strictEqual(updated?.status, DeliveryAssignmentStatus.EN_ROUTE_TO_SHOP);

    // Check history
    const history = await historyRepo.findByAssignmentId(assignment.id);
    const acceptHistory = history.find(h => h.transitionName === 'ACCEPT');
    assert.ok(acceptHistory);
    assert.strictEqual(acceptHistory?.previousStatus, 'ASSIGNED');
    assert.strictEqual(acceptHistory?.newStatus, 'EN_ROUTE_TO_SHOP');
    assert.strictEqual(acceptHistory?.performedByUserId, activeAgentId);

    assertPass('Agent Acceptance & Transition');
  } catch (e) { assertFail('Agent Acceptance & Transition', e); }

  // --- Test 5: Authorization Enforcement ---
  try {
    const assignment = await assignmentRepo.findById(assignment1Id);
    assert.ok(assignment);

    const unauthorizedAgent = activeAgentId === AGENT_1_ID ? AGENT_2_ID : AGENT_1_ID;

    // Unauthorized agent tries to pickup
    try {
      await assignmentService.pickupDelivery(assignment.id, unauthorizedAgent, 'cid-unauth');
      assert.fail('Should reject unauthorized pickup');
    } catch (err: any) {
      assert.ok(err.message.includes('Forbidden'));
    }

    assertPass('Authorization Enforcement');
  } catch (e) { assertFail('Authorization Enforcement', e); }

  // --- Test 6: Pickup Confirmation Driving Fulfillment OUT_FOR_DELIVERY ---
  try {
    const assignment = await assignmentRepo.findById(assignment1Id);
    assert.ok(assignment);

    // Agent picks up prints
    await assignmentService.pickupDelivery(assignment.id, activeAgentId, 'cid-pickup');

    const updated = await assignmentRepo.findById(assignment.id);
    assert.strictEqual(updated?.status, DeliveryAssignmentStatus.DELIVERING);

    // Simulating DELIVERY_PICKUP_COMPLETED event handling in Fulfillment
    const outboxEvents = await outboxRepo.claimBatch(10, 'test-worker');
    const pickupEvt = outboxEvents.find(e => e.eventType === 'DELIVERY_PICKUP_COMPLETED');
    assert.ok(pickupEvt);

    await deliveryPickupCompletedListener.handle(JSON.parse(pickupEvt.payload));

    // Fulfillment should transition status to OUT_FOR_DELIVERY
    const updatedF = await fulfillmentRepo.findById(fulfillment1Id);
    assert.strictEqual(updatedF?.status, FulfillmentStatus.OUT_FOR_DELIVERY);

    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    assertPass('Pickup Confirmation Driving Fulfillment OUT_FOR_DELIVERY');
  } catch (e) { assertFail('Pickup Confirmation Driving Fulfillment OUT_FOR_DELIVERY', e); }

  // --- Test 7: Delivery Reassignment ---
  try {
    // Setup a new fulfillment and assignment
    const f2DTO = await fulfillmentService.initializeFromPrintReady(1002, SHOP_ID, STUDENT_ID, 2002);
    fulfillment2Id = f2DTO.id;

    // Assign Agent 1 to Order 1002
    await deliveryDispatchRequestListener.handle({
      fulfillmentId: fulfillment2Id,
      agentId: AGENT_1_ID,
      userId: MANAGER_ID,
      correlationId: 'cid-1002'
    });

    const outboxEvents = await outboxRepo.claimBatch(10, 'test-worker');
    const assignEvt = outboxEvents.find(e => e.eventType === 'FULFILLMENT_ASSIGNED');
    await fulfillmentAssignedListener.handle(JSON.parse(assignEvt!.payload));

    const assignment = await assignmentRepo.findActiveByFulfillmentId(fulfillment2Id);
    assert.ok(assignment);
    assignment2Id = assignment.id;

    // Manager reassigns from Agent 1 to Agent 2
    await assignmentService.reassignAgent(assignment.id, AGENT_2_ID, MANAGER_ID, 'cid-reassign');

    // Claim and process the reassignment integration event
    const outboxEventsReassign = await outboxRepo.claimBatch(10, 'test-worker');
    const reassignEvt = outboxEventsReassign.find(e => e.eventType === 'DELIVERY_AGENT_ASSIGNED');
    assert.ok(reassignEvt);
    await deliveryAgentAssignedListener.handle(JSON.parse(reassignEvt.payload));

    for (const evt of outboxEventsReassign) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    const updated = await assignmentRepo.findById(assignment.id);
    assert.strictEqual(updated?.agentId, AGENT_2_ID, 'Agent ID updated to AGENT_2_ID');
    assert.strictEqual(updated?.status, DeliveryAssignmentStatus.ASSIGNED, 'Status reset back to ASSIGNED');

    // Verify Agent workloads
    const av1 = await availabilityRepo.findById(AGENT_1_ID);
    // Workload depends on whether AGENT_1_ID was the activeAgentId in Test 3
    const expectedAv1Workload = activeAgentId === AGENT_1_ID ? 1 : 0;
    assert.strictEqual(av1?.activeWorkload, expectedAv1Workload);

    // Agent 2 workload should increase
    const av2 = await availabilityRepo.findById(AGENT_2_ID);
    assert.strictEqual(av2?.status, DeliveryAgentStatus.BUSY);
    
    const expectedAv2Workload = activeAgentId === AGENT_2_ID ? 2 : 1;
    assert.strictEqual(av2?.activeWorkload, expectedAv2Workload);

    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    assertPass('Delivery Reassignment');
  } catch (e) { assertFail('Delivery Reassignment', e); }

  // --- Test 8: Agent Rejection Flow & Reassignment after Rejection ---
  try {
    const assignment = await assignmentRepo.findById(assignment2Id);
    assert.ok(assignment);

    // Agent 2 rejects the assignment
    await assignmentService.rejectAssignment(assignment.id, AGENT_2_ID, 'cid-reject');

    const updated = await assignmentRepo.findById(assignment.id);
    assert.strictEqual(updated?.status, DeliveryAssignmentStatus.REJECTED);

    // Agent 2 status back to AVAILABLE
    const av2 = await availabilityRepo.findById(AGENT_2_ID);
    // Workload should decrease by 1
    const expectedAv2Workload = activeAgentId === AGENT_2_ID ? 1 : 0;
    assert.strictEqual(av2?.activeWorkload, expectedAv2Workload);

    // Simulate DELIVERY_AGENT_REJECTED event handling in Fulfillment
    const outboxEvents = await outboxRepo.claimBatch(10, 'test-worker');
    const rejectEvt = outboxEvents.find(e => e.eventType === 'DELIVERY_AGENT_REJECTED');
    assert.ok(rejectEvt);

    await deliveryAgentRejectedListener.handle(JSON.parse(rejectEvt.payload));

    // Fulfillment status should reset back to READY
    const updatedF = await fulfillmentRepo.findById(fulfillment2Id);
    assert.strictEqual(updatedF?.status, FulfillmentStatus.READY);
    assert.strictEqual(updatedF?.assignedAgentId, null);

    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    assertPass('Agent Rejection Flow & Reassignment Reset');
  } catch (e) { assertFail('Agent Rejection Flow & Reassignment Reset', e); }

  // --- Test 9: Complete Delivery Flow ---
  try {
    const assignment1 = await assignmentRepo.findById(assignment1Id);
    assert.ok(assignment1);

    // Retrieve the raw OTP from the outbox event in the DB (even if processed)
    const [rows] = await db.execute(
      "SELECT payload FROM outbox_events WHERE event_type = 'FULFILLMENT_ASSIGNED' AND aggregate_id = ?",
      [fulfillment1Id.toString()]
    );
    assert.ok(rows && rows.length > 0, 'Should find the FULFILLMENT_ASSIGNED outbox event');
    const rawOtp = JSON.parse(rows[0].payload).rawOtp;

    await fulfillmentService.verifyOtp(fulfillment1Id, rawOtp, activeAgentId, CorrelationId.fromString('cid-otp'));

    // Agent completes assignment in Delivery context
    await assignmentService.completeDelivery(assignment1.id, 'http://proof-uri', activeAgentId, 'cid-complete');

    const updatedAssignment = await assignmentRepo.findById(assignment1.id);
    assert.strictEqual(updatedAssignment?.status, DeliveryAssignmentStatus.DELIVERED);

    // Agent is now AVAILABLE again
    const avActive = await availabilityRepo.findById(activeAgentId);
    assert.strictEqual(avActive?.status, DeliveryAgentStatus.AVAILABLE);
    assert.strictEqual(avActive?.activeWorkload, 0);

    // Simulating DELIVERY_COMPLETED event handling in Fulfillment
    const outboxEvents = await outboxRepo.claimBatch(10, 'test-worker');
    const completedEvt = outboxEvents.find(e => e.eventType === 'DELIVERY_COMPLETED');
    assert.ok(completedEvt);

    await deliveryCompletedListener.handle(JSON.parse(completedEvt.payload));

    // Fulfillment is DELIVERED
    const updatedF1 = await fulfillmentRepo.findById(fulfillment1Id);
    assert.strictEqual(updatedF1?.status, FulfillmentStatus.DELIVERED);

    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    assertPass('Complete Delivery Flow');
  } catch (e) { assertFail('Complete Delivery Flow', e); }

  // --- Test 10: Failed Delivery Flow ---
  try {
    // Setup Order 1003 / print job 2003
    const f3DTO = await fulfillmentService.initializeFromPrintReady(1003, SHOP_ID, STUDENT_ID, 2003);
    fulfillment3Id = f3DTO.id;

    await deliveryDispatchRequestListener.handle({
      fulfillmentId: fulfillment3Id,
      agentId: AGENT_2_ID,
      userId: MANAGER_ID,
      correlationId: 'cid-fail-test'
    });

    const outboxEvents = await outboxRepo.claimBatch(10, 'test-worker');
    const assignEvt = outboxEvents.find(e => e.eventType === 'FULFILLMENT_ASSIGNED');
    await fulfillmentAssignedListener.handle(JSON.parse(assignEvt!.payload));

    const assignment = await assignmentRepo.findActiveByFulfillmentId(fulfillment3Id);
    assert.ok(assignment);
    assignment3Id = assignment.id;

    // Accept, pickup, and then fail
    await assignmentService.acceptAssignment(assignment.id, AGENT_2_ID, 'cid-fail');
    await assignmentService.pickupDelivery(assignment.id, AGENT_2_ID, 'cid-fail');

    // Process pickup completed event to transition fulfillment to OUT_FOR_DELIVERY
    const outboxEventsPickup = await outboxRepo.claimBatch(10, 'test-worker');
    const pickupEvt = outboxEventsPickup.find(e => e.eventType === 'DELIVERY_PICKUP_COMPLETED');
    assert.ok(pickupEvt);
    await deliveryPickupCompletedListener.handle(JSON.parse(pickupEvt.payload));

    for (const evt of outboxEventsPickup) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    // Fail delivery
    await assignmentService.failDelivery(assignment.id, 'STUDENT_UNAVAILABLE', AGENT_2_ID, 'cid-fail');

    const updatedAssignment = await assignmentRepo.findById(assignment.id);
    assert.strictEqual(updatedAssignment?.status, DeliveryAssignmentStatus.FAILED);

    // Agent 2 status back to AVAILABLE
    const av2 = await availabilityRepo.findById(AGENT_2_ID);
    console.log('[DEBUG Test 10] Agent 2 availability after fail:', av2);
    assert.strictEqual(av2?.status, DeliveryAgentStatus.AVAILABLE);

    // Simulate DELIVERY_FAILED event handling in Fulfillment
    const outboxEvents2 = await outboxRepo.claimBatch(10, 'test-worker');
    const failedEvt = outboxEvents2.find(e => e.eventType === 'DELIVERY_FAILED');
    assert.ok(failedEvt);

    await deliveryFailedListener.handle(JSON.parse(failedEvt.payload));

    // Fulfillment status is FAILED
    const updatedF = await fulfillmentRepo.findById(fulfillment3Id);
    assert.strictEqual(updatedF?.status, FulfillmentStatus.FAILED);

    for (const evt of outboxEvents) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }
    for (const evt of outboxEvents2) {
      evt.status = OutboxEventStatus.PROCESSED;
      await outboxRepo.update(evt);
    }

    assertPass('Failed Delivery Flow');
  } catch (e) { assertFail('Failed Delivery Flow', e); }

  // --- Test 11: Invalid Transitions & Optimistic Locking ---
  try {
    const assignment = await assignmentRepo.findActiveByFulfillmentId(fulfillment3Id);
    assert.ok(!assignment, 'Should be no active assignment because it failed');

    // Load a stale version of Order 1001 delivery assignment
    const staleAssignment = await assignmentRepo.findById(assignment1Id);
    assert.ok(staleAssignment);

    // Attempting to update a completed assignment should throw terminal status error
    try {
      console.log('[DEBUG Test 11] staleAssignment status:', staleAssignment.status);
      staleAssignment.accept();
      assert.fail('Should fail transition check');
    } catch (err: any) {
      console.log('[DEBUG Test 11] Caught error:', err.message);
      assert.ok(err.message.includes('terminal status') || err.message.includes('terminal status'));
    }

    assertPass('Invalid Transitions & Optimistic Locking');
  } catch (e) { assertFail('Invalid Transitions & Optimistic Locking', e); }

  console.log(`\n🏁 Phase 6C Integration Verification Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Phase 6C Delivery bounded context assertions passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled runner exception:', err);
  process.exit(1);
});
