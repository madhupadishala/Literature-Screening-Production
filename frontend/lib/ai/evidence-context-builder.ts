import { getActiveTenant } from "@/lib/tenant/tenant-store";
import type {
  TenantCalendarEntry,
  TenantConfiguration,
  TenantKnowledgeSource,
  TenantProduct,
  TenantPromptConfiguration,
} from "@/lib/tenant/tenant-types";

import { searchKnowledge } from "@/lib/knowledge/knowledge-router";
import type { KnowledgeSearchResult } from "@/lib/knowledge/knowledge-types";

export type EvidenceContextPurpose =
  | "hit_generation"
  | "screening"
  | "intake"
  | "qc"
  | "narrative"
  | "assessment";

export interface EvidenceContextInput {
  tenantId?: string;
  purpose: EvidenceContextPurpose;
  query?: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceAbstract?: string;
  sourceFullText?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceContext {
  contextId: string;
  createdAt: string;
  purpose: EvidenceContextPurpose;
  tenant: Pick<
    TenantConfiguration,
    "id" | "tenantName" | "displayName" | "environment" | "status"
  > | null;
  productMaster: TenantProduct[];
  literatureCalendar: TenantCalendarEntry[];
  knowledgeSources: TenantKnowledgeSource[];
  promptConfigurations: TenantPromptConfiguration[];
  retrievedKnowledge: KnowledgeSearchResult[];
  source: {
    sourceId?: string;
    title?: string;
    abstract?: string;
    fullText?: string;
  };
  metadata: Record<string, unknown>;
}

function createContextId() {
  return `evidence-context-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function resolvePromptConfigurations(
  tenant: TenantConfiguration | null,
  purpose: EvidenceContextPurpose
): TenantPromptConfiguration[] {
  if (!tenant) return [];

  return tenant.promptConfigurations.filter(
    (prompt) => prompt.active && prompt.area === purpose
  );
}

export function buildEvidenceContext(
  input: EvidenceContextInput
): EvidenceContext {
  const tenant = getActiveTenant();

  const query =
    input.query ||
    input.sourceTitle ||
    input.sourceAbstract ||
    input.sourceFullText ||
    "";

  const retrievedKnowledge =
    tenant && query.trim()
      ? searchKnowledge({
          tenantId: input.tenantId ?? tenant.id,
          query,
          topK: 10,
        })
      : [];

  return {
    contextId: createContextId(),
    createdAt: new Date().toISOString(),
    purpose: input.purpose,
    tenant: tenant
      ? {
          id: tenant.id,
          tenantName: tenant.tenantName,
          displayName: tenant.displayName,
          environment: tenant.environment,
          status: tenant.status,
        }
      : null,
    productMaster: tenant?.productMaster ?? [],
    literatureCalendar: tenant?.literatureCalendar ?? [],
    knowledgeSources: tenant?.knowledgeSources ?? [],
    promptConfigurations: resolvePromptConfigurations(tenant, input.purpose),
    retrievedKnowledge,
    source: {
      sourceId: input.sourceId,
      title: input.sourceTitle,
      abstract: input.sourceAbstract,
      fullText: input.sourceFullText,
    },
    metadata: input.metadata ?? {},
  };
}

export function buildScreeningEvidenceContext(
  input: Omit<EvidenceContextInput, "purpose">
): EvidenceContext {
  return buildEvidenceContext({
    ...input,
    purpose: "screening",
  });
}

export function buildHitGenerationEvidenceContext(
  input: Omit<EvidenceContextInput, "purpose">
): EvidenceContext {
  return buildEvidenceContext({
    ...input,
    purpose: "hit_generation",
  });
}

export function buildIntakeEvidenceContext(
  input: Omit<EvidenceContextInput, "purpose">
): EvidenceContext {
  return buildEvidenceContext({
    ...input,
    purpose: "intake",
  });
}

export function buildQcEvidenceContext(
  input: Omit<EvidenceContextInput, "purpose">
): EvidenceContext {
  return buildEvidenceContext({
    ...input,
    purpose: "qc",
  });
}