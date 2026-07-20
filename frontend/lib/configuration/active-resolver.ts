import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type {
  ActiveTenantConfiguration,
  ConfigurationResourceType,
  ConfigurationVersionRecord,
} from "@/lib/configuration/types";

function toRecord(row: Record<string, unknown>): ConfigurationVersionRecord {
  return {
    id: String(row.id),
    configSetId: String(row.config_set_id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ConfigurationResourceType,
    configKey: String(row.config_key),
    displayName: String(row.display_name),
    versionNumber: Number(row.version_number),
    versionLabel: String(row.version_label),
    lifecycleStatus: "active",
    effectiveFrom: row.effective_from
      ? new Date(String(row.effective_from)).toISOString()
      : null,
    effectiveTo: row.effective_to
      ? new Date(String(row.effective_to)).toISOString()
      : null,
    payload: row.payload,
    validationReport:
      (row.validation_report as Record<string, unknown>) || {},
    sourceFilename: row.source_filename
      ? String(row.source_filename)
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function resolveActiveConfigurations(
  tenantId: string,
): Promise<ActiveTenantConfiguration> {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      SELECT
        v.*,
        s.resource_type,
        s.config_key,
        s.display_name
      FROM tenant_configuration_versions v
      JOIN tenant_configuration_sets s ON s.id = v.config_set_id
      WHERE v.tenant_id = $1
        AND v.lifecycle_status = 'active'
        AND (v.effective_from IS NULL OR v.effective_from <= now())
        AND (v.effective_to IS NULL OR v.effective_to > now())
      ORDER BY v.activated_at DESC NULLS LAST, v.version_number DESC
    `,
    [tenantId],
  );

  const records = result.rows.map(toRecord);
  const first = (type: ConfigurationResourceType) =>
    records.find((record) => record.resourceType === type) || null;
  const all = (type: ConfigurationResourceType) =>
    records.filter((record) => record.resourceType === type);

  return {
    productMaster: first("PRODUCT_MASTER"),
    literatureCalendar: first("LITERATURE_CALENDAR"),
    clientGuidelines: all("CLIENT_GUIDELINE"),
    outcomeTemplate: first("OUTCOME_TEMPLATE"),
    literatureSources: all("LITERATURE_SOURCE"),
    capturedAt: new Date().toISOString(),
  };
}

export function configurationSnapshotPayload(
  active: ActiveTenantConfiguration,
): Record<string, unknown> {
  return {
    capturedAt: active.capturedAt,
    productMaster: active.productMaster
      ? {
          id: active.productMaster.id,
          key: active.productMaster.configKey,
          version: active.productMaster.versionLabel,
        }
      : null,
    literatureCalendar: active.literatureCalendar
      ? {
          id: active.literatureCalendar.id,
          key: active.literatureCalendar.configKey,
          version: active.literatureCalendar.versionLabel,
        }
      : null,
    clientGuidelines: active.clientGuidelines.map((record) => ({
      id: record.id,
      key: record.configKey,
      version: record.versionLabel,
    })),
    outcomeTemplate: active.outcomeTemplate
      ? {
          id: active.outcomeTemplate.id,
          key: active.outcomeTemplate.configKey,
          version: active.outcomeTemplate.versionLabel,
        }
      : null,
    literatureSources: active.literatureSources.map((record) => ({
      id: record.id,
      key: record.configKey,
      version: record.versionLabel,
    })),
  };
}
