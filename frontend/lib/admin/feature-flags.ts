import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

interface FlagRow {
  flag_key: string; description: string; enabled: boolean;
  flag_version: number; updated_at: Date;
}

const DEFAULT_FLAGS = [
  ["enterprise-rag", "Enterprise RAG Engine", true],
  ["vector-search", "Vector Database", true],
  ["hits-ai", "Hits AI Agent", true],
  ["screening-ai", "Screening AI", true],
  ["evidence-builder", "Evidence Package Builder", true],
  ["notification-center", "Notification Center", true],
  ["micc", "Medical Information", false],
  ["clinical-trials", "Clinical Trial Module", false],
  ["social-media", "Social Media Module", false],
  ["regulatory-intelligence", "Regulatory Intelligence", false],
  ["legal", "Legal Cases", false],
] as const;

function mapRow(row: FlagRow): FeatureFlag {
  return { key: row.flag_key, description: row.description, enabled: row.enabled,
    version: row.flag_version, updatedAt: row.updated_at.toISOString() };
}

export class FeatureFlagService {
  async ensureDefaults(tenantId: string): Promise<void> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      for (const [key, description, enabled] of DEFAULT_FLAGS) {
        await client.query(
          `INSERT INTO tenant_feature_flags (tenant_id, flag_key, description, enabled)
           VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, flag_key) DO NOTHING`,
          [tenantId, key, description, enabled]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async list(tenantId: string): Promise<FeatureFlag[]> {
    const result = await getPostgresPool().query<FlagRow>(
      `SELECT * FROM tenant_feature_flags WHERE tenant_id = $1 ORDER BY flag_key`, [tenantId]);
    return result.rows.map(mapRow);
  }

  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    const result = await getPostgresPool().query<{ enabled: boolean }>(
      `SELECT enabled FROM tenant_feature_flags WHERE tenant_id = $1 AND flag_key = $2`,
      [tenantId, key]);
    return result.rows[0]?.enabled ?? false;
  }

  async set(input: { tenantId: string; key: string; description?: string;
    enabled: boolean; version: number; actorId?: string; requestId?: string | null;
  }): Promise<FeatureFlag> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<FlagRow>(
        `UPDATE tenant_feature_flags SET enabled = $3,
           description = COALESCE($4, description), flag_version = flag_version + 1,
           updated_by = $5, updated_at = now()
         WHERE tenant_id = $1 AND flag_key = $2 AND flag_version = $6 RETURNING *`,
        [input.tenantId, input.key, input.enabled, input.description ?? null,
          input.actorId ?? null, input.version]);
      if (!updated.rows[0]) throw new Error("Feature flag not found or version conflict");
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category,
           outcome, request_id, details)
         VALUES ($1,$2,'TENANT_FEATURE_FLAG_UPDATED','TENANT_CONFIGURATION',
           'success',$3,$4::jsonb)`,
        [input.tenantId, input.actorId ?? null, input.requestId ?? null,
          JSON.stringify({ key: input.key, enabled: input.enabled,
            flagVersion: updated.rows[0].flag_version })]);
      await client.query("COMMIT");
      return mapRow(updated.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}

export const featureFlagsService = new FeatureFlagService();
