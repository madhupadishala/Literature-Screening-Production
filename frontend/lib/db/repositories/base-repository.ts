import { databaseService } from "@/lib/db/database";
import type {
  DatabaseRecord,
  DatabaseTableName,
} from "@/lib/db/schema";

export class BaseRepository<T extends DatabaseRecord> {
  constructor(private readonly tableName: DatabaseTableName) {}

  async create(record: T): Promise<T> {
    return databaseService.insert<T>(this.tableName, record);
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    return databaseService.update<T>(this.tableName, id, patch);
  }

  async get(id: string): Promise<T | undefined> {
    return databaseService.get<T>(this.tableName, id);
  }

  async list(tenantId?: string): Promise<T[]> {
    return databaseService.list<T>({
      table: this.tableName,
      tenantId,
    });
  }

  async listWhere(
    filters: Record<string, unknown>,
    tenantId?: string,
  ): Promise<T[]> {
    return databaseService.list<T>({
      table: this.tableName,
      tenantId,
      filters,
    });
  }

  async delete(id: string): Promise<boolean> {
    return databaseService.delete(this.tableName, id);
  }
}