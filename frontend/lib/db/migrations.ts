export type MigrationStatus =
  | "pending"
  | "applied"
  | "failed";

export interface DatabaseMigration {
  id: string;
  name: string;
  description: string;
  status: MigrationStatus;
  appliedAt?: string;
}

const migrations = new Map<string, DatabaseMigration>();

export class MigrationRegistry {
  register(
    migration: Omit<DatabaseMigration, "status">,
  ): DatabaseMigration {
    const existing = migrations.get(migration.id);

    if (existing) {
      return existing;
    }

    const record: DatabaseMigration = {
      ...migration,
      status: "pending",
    };

    migrations.set(record.id, record);

    return record;
  }

  apply(migrationId: string): DatabaseMigration | undefined {
    const migration = migrations.get(migrationId);

    if (!migration) {
      return undefined;
    }

    const updated: DatabaseMigration = {
      ...migration,
      status: "applied",
      appliedAt: new Date().toISOString(),
    };

    migrations.set(migrationId, updated);

    return updated;
  }

  list(): DatabaseMigration[] {
    return Array.from(migrations.values());
  }

  seedDefaults(): void {
    if (migrations.size > 0) {
      return;
    }

    this.register({
      id: "001",
      name: "Initial Enterprise Schema",
      description:
        "Creates tenant, workflow, AI, review, evidence and system tables.",
    });

    this.register({
      id: "002",
      name: "AI Intelligence Schema",
      description:
        "Adds vector documents, RAG contexts, AI results and prompt tracking.",
    });

    this.register({
      id: "003",
      name: "Production Readiness Schema",
      description:
        "Adds monitoring, metrics, notifications, feature flags and configuration.",
    });
  }
}

export const migrationRegistry = new MigrationRegistry();