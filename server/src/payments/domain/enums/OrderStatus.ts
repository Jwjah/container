export enum OrderStatus {
  PENDING_PAYMENT = 'pending',
  PAID = 'confirmed', // Map to 'confirmed' for dashboard compatibility
  PRINTING = 'printing',
  READY_FOR_PICKUP = 'ready',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}
