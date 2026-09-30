-- 038_nexus_pv_documentation_foundation.sql
-- Cleanup Sprint 10: controlled PV Documentation foundation.

CREATE TABLE IF NOT EXISTS nexus_pv_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  document_key text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'PSMF','PVA','RMP','SOP','WORK_INSTRUCTION','SAFETY_REPORT',
    'SIGNAL_DOCUMENT','RISK_DOCUMENT','TRAINING','OTHER'
  )),
  title text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN (
    'DRAFT','IN_REVIEW','APPROVED','EFFECTIVE','RETIRED'
  )),
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_pv_document_workspace FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, environment, document_key),
  UNIQUE (tenant_id, workspace_id, environment, id)
);

CREATE INDEX IF NOT EXISTS idx_pv_documents_worklist
  ON nexus_pv_documents (tenant_id, workspace_id, environment, document_type, lifecycle_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS nexus_pv_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  document_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  version_status text NOT NULL CHECK (version_status IN ('DRAFT','REVIEWED','APPROVED','EFFECTIVE','RETIRED')),
  content jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  linked_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_reason text NOT NULL CHECK (length(trim(change_reason)) >= 10),
  effective_from date,
  effective_until date,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pv_document_version_dates_chk CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
  ),
  CONSTRAINT fk_pv_document_version_scope FOREIGN KEY
    (tenant_id, workspace_id, environment, document_id)
    REFERENCES nexus_pv_documents (tenant_id, workspace_id, environment, id)
    ON DELETE RESTRICT,
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_pv_document_versions
  ON nexus_pv_document_versions (document_id, version DESC);
