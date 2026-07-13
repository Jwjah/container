export interface ShopCapacityDTO {
  shopId: number;
  maxParallelOrders: number;
  isAcceptingOrders: boolean;
  overloadWaitThresholdSeconds: number;
}

export interface PrinterCapabilitiesDTO {
  pagesPerMinute: number;
  duplexSupported: boolean;
  colorSupported: boolean;
  supportedPaperSizes: string[];
  maximumPaperWeight: number;
  printableMedia: string[];
  warmupTimeSeconds: number;
}

export interface PrinterDTO {
  id: number | null;
  shopId: number;
  name: string;
  status: string;
  capabilities: PrinterCapabilitiesDTO;
  slotsCount: number;
  maintenanceCount: number;
}

export interface QueueSlotDTO {
  id: number | null;
  shopId: number;
  orderId: number;
  printerId: number | null;
  queuePosition: number;
  estimatedStartTime: string;
  estimatedCompletionTime: string;
  pagesCount: number;
  duplex: boolean;
  color: boolean;
  status: string;
}

export interface OrderEtaDTO {
  orderId: number;
  queuePosition: number;
  printerId: number | null;
  estimatedStartTime: string;
  estimatedCompletionTime: string;
}

export interface ReplenishRequestDTO {
  type: string; // 'paper' or 'ink'
  variant: string; // 'A4', 'A3', 'Black', 'Color'
  quantity: number;
}
