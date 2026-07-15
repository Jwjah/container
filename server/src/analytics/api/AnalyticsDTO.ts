// ---- Platform Report DTO ----
export interface PlatformReportDTO {
  period: { start: string; end: string };
  totalOrders: number;
  totalRevenue: number;
  successRate: number;
  cancellationRate: number;
  avgCompletionTimeSecs: number;
  avgDeliveryTimeSecs: number;
  lowStockEvents: number;
  topShops: { shopId: number; revenue: number; orders: number }[];
  dailyTrend: { date: string; orders: number; revenue: number }[];
}

// ---- Revenue Summary DTO ----
export interface RevenueSummaryDTO {
  today: number;
  last7Days: number;
  last30Days: number;
  allTime: number;
  dailyTrend: { date: string; revenue: number; orders: number }[];
}

// ---- Orders Report DTO ----
export interface OrdersReportDTO {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  successRate: number;
  dailyBreakdown: { date: string; created: number; completed: number; cancelled: number }[];
}

// ---- Shop Analytics DTO ----
export interface ShopAnalyticsDTO {
  shopId: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  successRate: number;
  avgCompletionTimeSecs: number;
  avgDeliveryTimeSecs: number;
  printerUtilizationPct: number;
  queueUtilizationPct: number;
  lowStockEvents: number;
}

// ---- User Analytics DTO ----
export interface UserAnalyticsDTO {
  userId: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalSpend: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  recentOrders: {
    orderId: number;
    shopId: number;
    date: string;
    revenue: number;
    completed: boolean;
    cancelled: boolean;
  }[];
}

// ---- Replay Status DTO ----
export interface ReplayStatusDTO {
  status: string;
  processedCount: number;
  totalCount: number;
  errorMessage: string | null;
}
