import "server-only";

import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";
import { pharmaceuticalScenarioContext } from "@/lib/pharmaceutical-intelligence/scenario-registry";

export async function buildTenantRuntimeConfigurationContext(
  tenantId: string,
): Promise<Record<string, unknown>> {
  const active = await resolveActiveConfigurations(tenantId);

  return {
    snapshot: configurationSnapshotPayload(active),
    productMaster: active.productMaster?.payload || null,
    pharmaceuticalProductIntelligence: pharmaceuticalScenarioContext(),
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
