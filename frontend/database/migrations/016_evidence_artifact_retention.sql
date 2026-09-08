ALTER TABLE evidence_artifacts
  ADD COLUMN IF NOT EXISTS provenance_url text,
  ADD COLUMN IF NOT EXISTS retrieved_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_policy text NOT NULL DEFAULT 'retain'
    CHECK (retention_policy IN ('retain', 'temporary', 'selective', 'regenerable')),
  ADD COLUMN IF NOT EXISTS retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE TABLE IF NOT EXISTS evidence_artifact_contents (
  artifact_id uuid PRIMARY KEY REFERENCES evidence_artifacts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_retention
  ON evidence_artifacts (tenant_id, retention_until)
  WHERE deleted_at IS NULL AND legal_hold = false;

CREATE INDEX IF NOT EXISTS idx_evidence_artifact_contents_tenant
  ON evidence_artifact_contents (tenant_id, artifact_id);
