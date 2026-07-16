import type {
  DatabaseHealth,
  DatabaseQuery,
  DatabaseRecord,
  DatabaseTableName,
} from "./schema";

const memoryTables = new Map<DatabaseTableName, Map<string, DatabaseRecord>>();

function ensureTable(table: DatabaseTableName): Map<string, DatabaseRecord> {
  const existing = memoryTables.get(table);

  if (existing) {
    return existing;
  }

  const created = new Map<string, DatabaseRecord>();
  memoryTables.set(table, created);

  return created;
}

function matchesFilters(
  record: DatabaseRecord,
  filters?: Record<string, unknown>,
): boolean {
  if (!filters) {
    return true;
  }

  return Object.entries(filters).every(([key, value]) => record[key] === value);
}

export class DatabaseService {
  private readonly provider = "memory-development";

  async health(): Promise<DatabaseHealth> {
    const start = Date.now();

    await Promise.resolve();

    return {
      provider: this.provider,
      connected: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }

  async insert<T extends DatabaseRecord>(
    tableName: DatabaseTableName,
    record: T,
  ): Promise<T> {
    const table = ensureTable(tableName);
    const now = new Date().toISOString();

    const storedRecord: T = {
      ...record,
      createdAt: record.createdAt || now,
      updatedAt: now,
    };

    table.set(storedRecord.id, storedRecord);

    return storedRecord;
  }

  async update<T extends DatabaseRecord>(
    tableName: DatabaseTableName,
    id: string,
    patch: Partial<T>,
  ): Promise<T | undefined> {
    const table = ensureTable(tableName);
    const existing = table.get(id) as T | undefined;

    if (!existing) {
      return undefined;
    }

    const updated: T = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    table.set(id, updated);

    return updated;
  }

  async get<T extends DatabaseRecord>(
    tableName: DatabaseTableName,
    id: string,
  ): Promise<T | undefined> {
    const table = ensureTable(tableName);

    return table.get(id) as T | undefined;
  }

  async list<T extends DatabaseRecord>(
    query: DatabaseQuery,
  ): Promise<T[]> {
    const table = ensureTable(query.table);

    let records = Array.from(table.values()) as T[];

    if (query.tenantId) {
      records = records.filter((record) => record.tenantId === query.tenantId);
    }

    records = records.filter((record) => matchesFilters(record, query.filters));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? records.length;

    return records.slice(offset, offset + limit);
  }

  async delete(tableName: DatabaseTableName, id: string): Promise<boolean> {
    const table = ensureTable(tableName);

    return table.delete(id);
  }

  async clearTable(tableName: DatabaseTableName): Promise<void> {
    ensureTable(tableName).clear();
  }
}

export const databaseService = new DatabaseService();