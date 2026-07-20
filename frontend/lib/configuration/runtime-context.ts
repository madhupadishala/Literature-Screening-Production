import "server-only";

import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";

export async function buildTenantRuntimeConfigurationContext(
  tenantId: string,
): Promise<Record<string, unknown>> {
  const active = await resolveActiveConfigurations(tenantId);

  return {
    snapshot: configurationSnapshotPayload(active),
    productMaster: active.productMaster?.payload || null,
    literatureCalendar: active.literatureCalendar?.payload || null,
    clientGuidelines: active.clientGuidelines.map((record) => ({
      id: record.id,
      key: record.configKey,
      version: record.versionLabel,
      payload: record.payload,
    })),
    outcomeTemplate: active.outcomeTemplate?.payload || null,
    literatureSources: active.literatureSources.map((record) => ({
      id: record.id,
      key: record.configKey,
      version: record.versionLabel,
      payload: record.payload,
    })),
    resolvedAt: new Date().toISOString(),
  };
}
