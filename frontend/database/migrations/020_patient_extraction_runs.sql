-- Sprint 6B: immutable source-linked patient extraction suggestions

CREATE TABLE IF NOT EXISTS literature_patient_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_workspace_id uuid NOT NULL REFERENCES literature_review_workspaces(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  screening_result_id uuid NOT NULL REFERENCES screening_results(id) ON DELETE RESTRICT,
  run_version integer NOT NULL,
  extraction_payload jsonb NOT NULL,
  source_sha256 text NOT NULL,
  confidence numeric(5,4),
  provider text NOT NULL,
  model text NOT NULL,
  request_id text NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_patient_extraction_confidence_chk
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  UNIQUE (tenant_id, review_workspace_id, run_version)
);

CREATE INDEX IF NOT EXISTS idx_patient_extraction_workspace_version
  ON literature_patient_extraction_runs (tenant_id, review_workspace_id, run_version DESC);

CREATE INDEX IF NOT EXISTS idx_patient_extraction_package_time
  ON literature_patient_extraction_runs (tenant_id, package_id, created_at DESC);

-- Review-stage not-applicable semantics for articles with zero patient/case segments.
ALTER TABLE literature_review_workspaces
  DROP CONSTRAINT IF EXISTS literature_review_label_status_chk;

ALTER TABLE literature_review_workspaces
  ADD CONSTRAINT literature_review_label_status_chk
  CHECK (labeling_status IN ('NOT_CONFIGURED', 'PENDING', 'COMPLETE', 'UNRESOLVED', 'NOT_APPLICABLE'));

ALTER TABLE literature_review_workspaces
  DROP CONSTRAINT IF EXISTS literature_review_causality_status_chk;

ALTER TABLE literature_review_workspaces
  ADD CONSTRAINT literature_review_causality_status_chk
  CHECK (causality_status IN ('NOT_CONFIGURED', 'PENDING', 'COMPLETE', 'UNRESOLVED', 'NOT_APPLICABLE'));
