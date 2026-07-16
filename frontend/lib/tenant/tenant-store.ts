import type {
  TenantCalendarEntry,
  TenantConfiguration,
  TenantFeatureFlags,
  TenantKnowledgeSource,
  TenantProduct,
  TenantPromptConfiguration,
} from "./tenant-types";

const now = () => new Date().toISOString();

export const defaultTenantFeatureFlags: TenantFeatureFlags = {
  enableKnowledgeRouting: true,
  enableBulkOperations: true,
  enableVersioning: true,
  enableAuditReview: true,
  enableQcWorkflow: true,
};

export const defaultTenantProducts: TenantProduct[] = [
  {
    id: "product-paracetamol",
    productName: "Paracetamol",
    genericName: "Acetaminophen",
    brandNames: ["Paracetamol", "Acetaminophen"],
    synonyms: ["APAP", "N-acetyl-p-aminophenol"],
    companySuspect: true,
    active: true,
  },
];

export const defaultTenantCalendar: TenantCalendarEntry[] = [
  {
    id: "calendar-paracetamol-weekly",
    productId: "product-paracetamol",
    productName: "Paracetamol",
    searchDay: "Monday",
    frequency: "weekly",
    runMode: "hybrid",
    active: true,
  },
];

export const defaultTenantKnowledgeSources: TenantKnowledgeSource[] = [
  {
    id: "knowledge-default-product-rules",
    title: "Default Product Matching Rules",
    type: "product_rules",
    fileName: "default-product-rules.md",
    version: "1.0",
    active: true,
  },
];

export const defaultTenantPromptConfigurations: TenantPromptConfiguration[] = [
  {
    id: "prompt-hit-generation-default",
    area: "hit_generation",
    name: "Default Hit Generation Prompt",
    instruction:
      "Identify literature safety hits using tenant product master, calendar rules, validity criteria, adverse event detection and company suspect product logic.",
    version: "1.0",
    active: true,
  },
  {
    id: "prompt-screening-default",
    area: "screening",
    name: "Default Screening Prompt",
    instruction:
      "Screen literature hits for patient, reporter, adverse event, suspect product, seriousness, special situations, country of incidence and case validity.",
    version: "1.0",
    active: true,
  },
];

export function createDefaultTenant(): TenantConfiguration {
  const timestamp = now();

  return {
    id: "tenant-clinixai-default",
    tenantName: "clinixai-default",
    displayName: "ClinixAI Default Tenant",
    status: "active",
    environment: "TEST",
    productMaster: defaultTenantProducts,
    literatureCalendar: defaultTenantCalendar,
    knowledgeSources: defaultTenantKnowledgeSources,
    promptConfigurations: defaultTenantPromptConfigurations,
    featureFlags: defaultTenantFeatureFlags,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

let tenants: TenantConfiguration[] = [createDefaultTenant()];
let activeTenantId: string | null = tenants[0]?.id ?? null;

export function getTenants(): TenantConfiguration[] {
  return tenants;
}

export function getActiveTenantId(): string | null {
  return activeTenantId;
}

export function getActiveTenant(): TenantConfiguration | null {
  if (!activeTenantId) return null;
  return tenants.find((tenant) => tenant.id === activeTenantId) ?? null;
}

export function getTenantById(tenantId: string): TenantConfiguration | null {
  return tenants.find((tenant) => tenant.id === tenantId) ?? null;
}

export function setActiveTenant(tenantId: string): TenantConfiguration | null {
  const tenant = getTenantById(tenantId);

  if (!tenant) {
    return null;
  }

  activeTenantId = tenant.id;
  return tenant;
}

export function upsertTenant(
  tenant: TenantConfiguration
): TenantConfiguration {
  const timestamp = now();

  const normalizedTenant: TenantConfiguration = {
    ...tenant,
    updatedAt: timestamp,
    createdAt: tenant.createdAt || timestamp,
  };

  const existingIndex = tenants.findIndex((item) => item.id === tenant.id);

  if (existingIndex >= 0) {
    tenants = tenants.map((item, index) =>
      index === existingIndex ? normalizedTenant : item
    );
  } else {
    tenants = [...tenants, normalizedTenant];
  }

  if (!activeTenantId) {
    activeTenantId = normalizedTenant.id;
  }

  return normalizedTenant;
}

export function deleteTenant(tenantId: string): boolean {
  const existingTenant = getTenantById(tenantId);

  if (!existingTenant) {
    return false;
  }

  tenants = tenants.filter((tenant) => tenant.id !== tenantId);

  if (activeTenantId === tenantId) {
    activeTenantId = tenants[0]?.id ?? null;
  }

  return true;
}

export function getTenantConfigSnapshot() {
  return {
    tenants,
    activeTenantId,
  };
}