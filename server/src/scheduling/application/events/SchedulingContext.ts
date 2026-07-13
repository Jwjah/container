import { SchedulingEngine } from '../services/SchedulingEngine';
import { QueueService } from '../services/QueueService';
import { InventoryService } from '../services/InventoryService';
import { MaintenancePlanner } from '../services/MaintenancePlanner';
import { IShopCapacityRepository } from '../../interfaces/IShopCapacityRepository';
import { IPrinterRepository } from '../../interfaces/IPrinterRepository';

export interface SchedulingContext {
  schedulingEngine: SchedulingEngine;
  queueService: QueueService;
  inventoryService: InventoryService;
  maintenancePlanner: MaintenancePlanner;
  capacityRepo: IShopCapacityRepository;
  printerRepo: IPrinterRepository;
  connection?: any;
}
