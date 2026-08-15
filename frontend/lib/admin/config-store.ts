import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export interface TenantConfiguration {
  tenantId: string;
  organizationName: string;
  environment: "development" | "uat" | "production";
  timezone: string;
  defaultCountry?: string;
  ai: { defaultModel: string; defaultPromptVersion: string;
    enableRAG: boolean; enableVectorSearch: boolean };
  workflow: { autoAssignment: boolean; requireQC: boolean; requireHumanReview: boolean };
  branding: { applicationName: string; logo?: string; primaryColor?: string };
  version: number;
  updatedAt: string;
}

interface ConfigurationRow {
  tenant_id: string;
  configuration: Omit<TenantConfiguration, "tenantId" | "version" | "updatedAt">;
  configuration_version: number;
  updated_at: Date;
}

function configurationPayload(configuration: TenantConfiguration) {
  return {
    organizationName: configuration.organizationName,
    environment: configuration.environment,
    timezone: configuration.timezone,
    defaultCountry: configuration.defaultCountry,
    ai: configuration.ai,
    workflow: configuration.workflow,
    branding: configuration.branding,
  };
}

function mapRow(row: ConfigurationRow): TenantConfiguration {
  return { ...row.configuration, tenantId: row.tenant_id,
    version: row.configuration_version, updatedAt: row.updated_at.toISOString() };
}

export function defaultTenantConfiguration(
  tenantId: string,
  organizationName = "ClinixAI Literature",
): TenantConfiguration {
  return { tenantId, organizationName, environment: "production", timezone: "Asia/Kolkata",
    defaultCountry: "India", ai: { defaultModel: "gpt-5", defaultPromptVersion: "v1",
      enableRAG: true, enableVectorSearch: true }, workflow: { autoAssignment: true,
      requireQC: true, requireHumanReview: true }, branding: { applicationName: organizationName,
      primaryColor: "#2563eb" }, version: 1, updatedAt: new Date().toISOString() };
}

export class ConfigurationStore {
  async ensure(tenantId: string, organizationName?: string): Promise<TenantConfiguration> {
    const configuration = defaultTenantConfiguration(tenantId, organizationName);
    const payload = configurationPayload(configuration);
    const result = await getPostgresPool().query<ConfigurationRow>(
      `INSERT INTO tenant_runtime_configurations (tenant_id, configuration)
       VALUES ($1, $2::jsonb) ON CONFLICT (tenant_id) DO UPDATE
         SET tenant_id = tenant_runtime_configurations.tenant_id RETURNING *`,
      [tenantId, JSON.stringify(payload)]);
    return mapRow(result.rows[0]);
  }

  async get(tenantId: string): Promise<TenantConfiguration | undefined> {
    const result = await getPostgresPool().query<ConfigurationRow>(
      `SELECT * FROM tenant_runtime_configurations WHERE tenant_id = $1`, [tenantId]);
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async upsert(input: TenantConfiguration, actorId?: string,
    requestId?: string | null): Promise<TenantConfiguration> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const payload = configurationPayload(input);
      const result = await client.query<ConfigurationRow>(
        `INSERT INTO tenant_runtime_configurations
           (tenant_id, configuration, configuration_version, updated_by)
         VALUES ($1,$2::jsonb,1,$3)
         ON CONFLICT (tenant_id) DO UPDATE SET configuration = EXCLUDED.configuration,
           configuration_version = tenant_runtime_configurations.configuration_version + 1,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         WHERE tenant_runtime_configurations.configuration_version = $4 RETURNING *`,
        [input.tenantId, JSON.stringify(payload), actorId ?? null, input.version]);
      if (!result.rows[0]) throw new Error("Tenant configuration version conflict");
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category,
           outcome, request_id, details)
         VALUES ($1,$2,'TENANT_RUNTIME_CONFIGURATION_UPDATED','TENANT_CONFIGURATION',
           'success',$3,$4::jsonb)`,
        [input.tenantId, actorId ?? null, requestId ?? null,
          JSON.stringify({ configurationVersion: result.rows[0].configuration_version })]);
      await client.query("COMMIT");
      return mapRow(result.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}

export const configurationStoreService = new ConfigurationStore();
