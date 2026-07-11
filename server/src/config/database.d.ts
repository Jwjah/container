interface DatabaseConnection {
  execute(query: string, params?: any[]): Promise<[any[], any]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

interface DatabasePool {
  execute(query: string, params?: any[]): Promise<[any[], any]>;
  getConnection(): Promise<DatabaseConnection>;
  transaction<T>(callback: (conn: DatabaseConnection) => Promise<T>): Promise<T>;
}

declare const db: DatabasePool;
export default db;
export { DatabaseConnection, DatabasePool };
