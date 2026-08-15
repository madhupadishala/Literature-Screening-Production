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
  {
    id: "005",
    name: "Hits Review Persistence",
    filename: "005_hits_review_persistence.sql",
    required: true,
  },
  {
    id: "006",
    name: "Duplicate Intelligence",
    filename: "006_duplicate_intelligence.sql",
    required: true,
  },
  {
    id: "007",
    name: "Screening Workflow",
    filename: "007_screening_workflow.sql",
    required: true,
  },
  {
    id: "008",
    name: "Intake Input Generation",
    filename: "008_intake_input_generation.sql",
    required: true,
  },
  {
    id: "009",
    name: "Enterprise Audit Trail",
    filename: "009_enterprise_audit_trail.sql",
    required: true,
  },
  {
    id: "010",
    name: "Enterprise RBAC",
    filename: "010_enterprise_rbac.sql",
    required: true,
  },
  {
    id: "011",
    name: "Enterprise Reliability",
    filename: "011_enterprise_reliability.sql",
    required: true,
  },
  {
    id: "012",
    name: "Enterprise Performance",
    filename: "012_enterprise_performance.sql",
    required: true,
  },
  {
    id: "013",
    name: "Production Release Governance",
    filename: "013_production_release_governance.sql",
    required: true,
  },
  {
    id: "014",
    name: "Controlled Knowledge pgvector",
    filename: "014_controlled_knowledge_pgvector.sql",
    required: true,
  },
  { id: "015", name: "Authentication Credentials", filename: "015_authentication_credentials.sql", required: true },
  { id: "016", name: "Evidence Artifact Retention", filename: "016_evidence_artifact_retention.sql", required: true },
  { id: "017", name: "Legacy Evidence Review Persistence", filename: "017_legacy_evidence_review_persistence.sql", required: true },
  { id: "018", name: "IO Job Persistence", filename: "018_io_job_persistence.sql", required: true },
  { id: "019", name: "Knowledge Governance Persistence", filename: "019_knowledge_governance_persistence.sql", required: true },
  { id: "020", name: "Knowledge Repository Persistence", filename: "020_knowledge_repository_persistence.sql", required: true },
  { id: "021", name: "Generic Document Storage", filename: "021_generic_document_storage.sql", required: true },
  { id: "022", name: "Durable Jobs Scheduler", filename: "022_durable_jobs_scheduler.sql", required: true },
] as const;
