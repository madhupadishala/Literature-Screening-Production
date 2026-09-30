-- 037_nexus_aggregate_reporting_foundation.sql
-- Cleanup Sprint 9: governed Aggregate Reporting foundation.

CREATE TABLE IF NOT EXISTS nexus_aggregate_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  report_key text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('PSUR_PBRER','DSUR','PADER','LINE_LISTING','CUSTOM')),
  product_key text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','GENERATED','UNDER_REVIEW','APPROVED','FINALIZED')),
  source_snapshot jsonb NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aggregate_period_chk CHECK (period_end >= period_start),
  CONSTRAINT fk_aggregate_workspace FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, environment, report_key),
  UNIQUE (tenant_id, workspace_id, environment, id)
);

CREATE INDEX IF NOT EXISTS idx_aggregate_worklist
  ON nexus_aggregate_reports (tenant_id, workspace_id, environment, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS nexus_aggregate_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  aggregate_report_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) >= 10),
  status text NOT NULL CHECK (status IN ('DRAFT','REVIEWED','APPROVED','FINALIZED')),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_aggregate_version_scope FOREIGN KEY
    (tenant_id, workspace_id, environment, aggregate_report_id)
    REFERENCES nexus_aggregate_reports (tenant_id, workspace_id, environment, id)
    ON DELETE RESTRICT,
  UNIQUE (aggregate_report_id, version)
);

CREATE INDEX IF NOT EXISTS idx_aggregate_versions
  ON nexus_aggregate_report_versions (aggregate_report_id, version DESC);
