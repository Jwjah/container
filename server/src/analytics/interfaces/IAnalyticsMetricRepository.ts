import { AnalyticsMetric } from '../domain/entities/AnalyticsMetric';

export interface IAnalyticsMetricRepository {
  findByDate(date: string, connection?: any): Promise<AnalyticsMetric | null>;
  findRange(startDate: string, endDate: string, connection?: any): Promise<AnalyticsMetric[]>;
  upsert(metric: AnalyticsMetric, connection?: any): Promise<AnalyticsMetric>;
  deleteAll(connection?: any): Promise<void>;
}
