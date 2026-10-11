-- Nexus Step 2.2 PostgreSQL migration. APPLY ONLY to an approved isolated validation branch.
-- No production deployment or clinical rule activation is authorized by this file.
-- The operational database must enforce service-level RBAC before any policy write.
CREATE TABLE IF NOT EXISTS nexus_clinical_rule_revisions (
  rule_id text NOT NULL,
  version integer NOT NULL CHECK(version >= 1),
  owner_agent text NOT NULL,
  domain text NOT NULL,
  policy_scope text NOT NULL CHECK(policy_scope IN ('GLOBAL','NEXUS','TENANT','CLIENT')),
  tenant_id text,
  client_id text,
  jurisdiction text NOT NULL DEFAULT 'GLOBAL',
  effective_from date NOT NULL,
  effective_until date,
  approval_status text NOT NULL CHECK(approval_status IN ('DRAFT','APPROVED','BLOCKED','SUPERSEDED')),
  rule_text text NOT NULL,
  regulatory_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_table jsonb NOT NULL,
  checksum text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(rule_id,version),
  CHECK(effective_until IS NULL OR effective_until >= effective_from),
  CHECK((policy_scope IN ('GLOBAL','NEXUS') AND tenant_id IS NULL AND client_id IS NULL)
     OR (policy_scope='TENANT' AND tenant_id IS NOT NULL AND client_id IS NULL)
     OR (policy_scope='CLIENT' AND tenant_id IS NOT NULL AND client_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS nexus_clinical_rule_approved_lookup
  ON nexus_clinical_rule_revisions(owner_agent,rule_id,approval_status,policy_scope,tenant_id,client_id,jurisdiction,effective_from);
-- NOTE: This schema alone does not confer row-level security or policy approval.
-- Before deployment, implement RLS for current tenant/client context,
-- transactional approval provenance, non-overridable regulatory guardrails,
-- and append-only revision privileges. No runtime application wiring yet.
