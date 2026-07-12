export enum PrintJobStatus {
  QUEUED = 'QUEUED',
  ACCEPTED = 'ACCEPTED',
  PRINTING = 'PRINTING',
  READY = 'READY',
  CANCELLED = 'CANCELLED',
  
  // Kept for backward compatibility or future workflows
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED'
}
