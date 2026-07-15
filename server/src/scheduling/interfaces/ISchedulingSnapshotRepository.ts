import { SchedulingSnapshot } from '../domain/entities/SchedulingSnapshot';

export interface ISchedulingSnapshotRepository {
  findLatestByShopId(shopId: number, connection?: any): Promise<SchedulingSnapshot | null>;
  save(snapshot: SchedulingSnapshot, connection?: any): Promise<void>;
  deleteAll(connection?: any): Promise<void>;
}
