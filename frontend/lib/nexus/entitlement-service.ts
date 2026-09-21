import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import {
  entitlementIsActive,
  type EntitlementStatus,
  type NexusEnvironment,
  type TenantModuleEntitlement,
} from "@/lib/nexus/entitlement-types";
import {
  getModuleDependencies,
  isNexusModuleKey,
  type NexusModuleKey,
} from "@/lib/nexus/modules";

interface EntitlementRow {
  tenant_id: string;
  environment: NexusEnvironment;
  module_key: string;
  status: EntitlementStatus;
  capabilities: unknown;
  limits: unknown;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  version: number;
  updated_at: Date | string;
}

function recordOfBooleans(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === "boolean"),
  ) as Record<string, boolean>;
}

function recordOfLimits(
  value: unknown,
): Record<string, number | string | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item === null || ["number", "string", "boolean"].includes(typeof item),
    ),
  ) as Record<string, number | string | boolean | null>;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: EntitlementRow): TenantModuleEntitlement | null {
  if (!isNexusModuleKey(row.module_key)) return null;

  return {
    tenantId: row.tenant_id,
    environment: row.environment,
    moduleKey: row.module_key,
    status: row.status,
    capabilities: recordOfBooleans(row.capabilities),
    limits: recordOfLimits(row.limits),
    validFrom: iso(row.valid_from),
    validUntil: iso(row.valid_until),
    version: row.version,
    updatedAt: iso(row.updated_at) || new Date(0).toISOString(),
  };
}

export async function getTenantEntitlements(
  tenantId: string,
  environment: NexusEnvironment,
): Promise<TenantModuleEntitlement[]> {
  const result = await getPostgresPool().query<EntitlementRow>(
    `SELECT tenant_id, environment, module_key, status, capabilities, limits,
            valid_from, valid_until, version, updated_at
       FROM tenant_module_entitlements
      WHERE tenant_id = $1
        AND environment = $2
      ORDER BY module_key`,
    [tenantId, environment],
  );

  return result.rows.map(mapRow).filter((row): row is TenantModuleEntitlement => Boolean(row));
}

export async function moduleIsEffectivelyEnabled(
  tenantId: string,
  environment: NexusEnvironment,
  moduleKey: NexusModuleKey,
): Promise<boolean> {
  const entitlements = await getTenantEntitlements(tenantId, environment);
  const byModule = new Map(entitlements.map((item) => [item.moduleKey, item]));

  const current = byModule.get(moduleKey);
  if (!current || !entitlementIsActive(current)) return false;

  for (const dependency of getModuleDependencies(moduleKey)) {
    const dependencyEntitlement = byModule.get(dependency);
    if (!dependencyEntitlement || !entitlementIsActive(dependencyEntitlement)) return false;
  }

  return true;
}

export interface UpdateEntitlementInput {
  tenantId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  status: EntitlementStatus;
  capabilities?: Record<string, boolean>;
  limits?: Record<string, number | string | boolean | null>;
  validFrom?: string | null;
  validUntil?: string | null;
  changedBy: string;
  reason: string;
}

export async function updateTenantEntitlement(
  input: UpdateEntitlementInput,
): Promise<TenantModuleEntitlement> {
  if (!input.reason.trim()) {
    throw new Error("A change reason is required for entitlement updates.");
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const previous = await client.query<EntitlementRow>(
      `SELECT tenant_id, environment, module_key, status, capabilities, limits,
              valid_from, valid_until, version, updated_at
         FROM tenant_module_entitlements
        WHERE tenant_id = $1 AND environment = $2 AND module_key = $3
        FOR UPDATE`,
      [input.tenantId, input.environment, input.moduleKey],
    );

    const previousRow = previous.rows[0] ?? null;
    const nextVersion = (previousRow?.version ?? 0) + 1;

    if (previousRow) {
      await client.query(
        `INSERT INTO tenant_module_entitlement_history (
           tenant_id, environment, module_key, version, status, capabilities, limits,
           valid_from, valid_until, changed_by, change_reason
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
        [
          previousRow.tenant_id,
          previousRow.environment,
          previousRow.module_key,
          previousRow.version,
          previousRow.status,
          JSON.stringify(previousRow.capabilities ?? {}),
          JSON.stringify(previousRow.limits ?? {}),
          previousRow.valid_from,
          previousRow.valid_until,
          input.changedBy,
          input.reason,
        ],
      );
    }

    const updated = await client.query<EntitlementRow>(
      `INSERT INTO tenant_module_entitlements (
         tenant_id, environment, module_key, status, capabilities, limits,
         valid_from, valid_until, version, updated_by, updated_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,now())
       ON CONFLICT (tenant_id, environment, module_key)
       DO UPDATE SET
         status = EXCLUDED.status,
         capabilities = EXCLUDED.capabilities,
         limits = EXCLUDED.limits,
         valid_from = EXCLUDED.valid_from,
         valid_until = EXCLUDED.valid_until,
         version = EXCLUDED.version,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING tenant_id, environment, module_key, status, capabilities, limits,
                 valid_from, valid_until, version, updated_at`,
      [
        input.tenantId,
        input.environment,
        input.moduleKey,
        input.status,
        JSON.stringify(input.capabilities ?? {}),
        JSON.stringify(input.limits ?? {}),
        input.validFrom ?? null,
        input.validUntil ?? null,
        nextVersion,
        input.changedBy,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'MODULE_ENTITLEMENT_CHANGED','SECURITY_ENTITLEMENT','success',$3::jsonb)`,
      [
        input.tenantId,
        input.changedBy,
        JSON.stringify({
          environment: input.environment,
          moduleKey: input.moduleKey,
          previousStatus: previousRow?.status ?? null,
          newStatus: input.status,
          version: nextVersion,
          reason: input.reason,
        }),
      ],
    );

    await client.query("COMMIT");

    const mapped = mapRow(updated.rows[0]);
    if (!mapped) throw new Error("Updated entitlement returned an invalid module key.");
    return mapped;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
