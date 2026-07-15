import { UserAnalytics } from '../domain/entities/UserAnalytics';

export interface IUserAnalyticsRepository {
  findByUserId(userId: number, connection?: any): Promise<UserAnalytics | null>;
  upsert(analytics: UserAnalytics, connection?: any): Promise<UserAnalytics>;
  deleteAll(connection?: any): Promise<void>;
}
