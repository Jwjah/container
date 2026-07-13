import { LifecycleState } from '../domain/enums/LifecycleState';

export interface TimelineEventDTO {
  id: number | null;
  orderId: number;
  eventId: string;
  eventType: string;
  state: LifecycleState;
  title: string;
  description: string;
  occurredAt: string;
  actorType: string;
  actorId: number | null;
  metadata: any;
  correlationId: string;
}

export interface TrackingDTO {
  orderId: number;
  orderHash: string;
  studentId: number;
  shopId: number;
  shopName: string;
  deliveryType: 'pickup' | 'hostel';
  hostelAddress: string | null;
  totalPrice: number;
  currentState: LifecycleState;
  paymentStatus: string;
  invoiceNumber: string | null;
  printJobId: number | null;
  printStatus: string | null;
  fulfillmentId: number | null;
  fulfillmentStatus: string | null;
  assignedAgentId: number | null;
  agentName: string | null;
  agentPhone: string | null;
  lastProcessedVersion: number;
  lastProcessedOccurredAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  timeline?: TimelineEventDTO[];
}

export interface ProjectionStatusDTO {
  workerState: string;
  queueLag: number;
  replayActive: boolean;
  dlqSize: number;
  processedEventsCount: number;
  lastProcessedEventId: string | null;
  lastProcessedAt: string | null;
}
