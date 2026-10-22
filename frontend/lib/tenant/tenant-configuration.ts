import "server-only";
import { z } from "zod";
import { getPostgresPool } from "@/lib/database/postgres";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import type { TenantConfiguration } from "./tenant-types";

const text = z.string().max(20_000);
export const tenantSettingsSchema = z.object({
  productMaster: z.array(z.object({ id: text, productName: text, genericName: text.optional(),
    brandNames: z.array(text).optional(), synonyms: z.array(text).optional(), companySuspect: z.boolean(), active: z.boolean() })).max(10_000),
  literatureCalendar: z.array(z.object({ id: text, productId: text, productName: text, searchDay: text,
    frequency: z.enum(["daily", "weekly", "monthly", "ad_hoc"]), runMode: z.enum(["manual", "scheduled", "hybrid"]), active: z.boolean() })).max(10_000),
  knowledgeSources: z.array(z.object({ id: text, title: text,
    type: z.enum(["sop", "work_instruction", "product_rules", "calendar_rules", "prompt_rules", "client_guidance", "regulatory_reference"]),
    fileName: text.optional(), version: text.optional(), effectiveDate: text.optional(), active: z.boolean() })).max(10_000),
  promptConfigurations: z.array(z.object({ id: text, area: z.enum(["hit_generation", "screening", "intake", "qc", "narrative", "assessment", "audit"]),
    name: text, instruction: text, version: text, active: z.boolean() })).max(1_000),
  featureFlags: z.object({ enableKnowledgeRouting: z.boolean(), enableBulkOperations: z.boolean(),
    enableVersioning: z.boolean(), enableAuditReview: z.boolean(), enableQcWorkflow: z.boolean() }),
});
const emptySettings = { productMaster: [], literatureCalendar: [], knowledgeSources: [], promptConfigurations: [],
  featureFlags: { enableKnowledgeRouting: false, enableBulkOperations: false, enableVersioning: false, enableAuditReview: false, enableQcWorkflow: false } };

/** The caller must resolve tenant membership; there is deliberately no global active tenant. */
export async function getTenantConfiguration(tenantId: string, environment: NexusEnvironment): Promise<TenantConfiguration> {
  const result = await getPostgresPool().query<{
    id: string; tenant_key: string; display_name: string; configuration: Record<string, unknown>;
    created_at: Date; updated_at: Date;
  }>(`SELECT id, tenant_key, display_name, configuration, created_at, updated_at
        FROM tenants WHERE id = $1 AND status = 'active'`, [tenantId]);
  const row = result.rows[0];
  if (!row) throw Object.assign(new Error("Tenant not found."), { statusCode: 404 });
  const settings = tenantSettingsSchema.parse(row.configuration.tenantUi ?? emptySettings);
  return { ...settings, id: row.id, tenantName: row.tenant_key, displayName: row.display_name, status: "active",
    environment: environment === "PROD" ? "PROD" : "TEST",
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
