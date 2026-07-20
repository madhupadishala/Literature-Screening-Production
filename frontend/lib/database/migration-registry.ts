export interface RequiredMigration {
  id: string;
  name: string;
  filename: string;
  required: true;
}

export const REQUIRED_DATABASE_MIGRATIONS: readonly RequiredMigration[] = [
  {
    id: "001",
    name: "Initial Enterprise Schema",
    filename: "001_initial_enterprise_schema.sql",
    required: true,
  },
  {
    id: "002",
    name: "AI Intelligence Schema",
    filename: "002_ai_intelligence_schema.sql",
    required: true,
  },
  {
    id: "003",
    name: "Production Readiness Schema",
    filename: "003_production_readiness_schema.sql",
    required: true,
  },
  {
    id: "004",
    name: "Ad Hoc Search and Tenant Configuration",
    filename: "004_adhoc_search_tenant_configuration.sql",
    required: true,
  },
] as const;
