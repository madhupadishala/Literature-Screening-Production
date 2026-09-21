-- Sprint 4 architecture correction:
-- 1) distinguish production Search Evidence Packages from optional Validation Packages
-- 2) establish the post-Screening Review / Medical Review data boundary

CREATE TABLE IF NOT EXISTS literature_search_evidence_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES ad_hoc_literature_searches(id) ON DELETE RESTRICT,
  package_key text NOT NULL,
  execution_purpose text NOT NULL,
  payload jsonb NOT NULL,
  content_sha256 text NOT NULL,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_search_evidence_purpose_chk
    CHECK (execution_purpose IN ('MANUAL_PRODUCTION', 'SCHEDULED_PRODUCTION')),
  UNIQUE (tenant_id, search_id),
  UNIQUE (tenant_id, package_key)
);

CREATE INDEX IF NOT EXISTS idx_search_evidence_packages_tenant_time
  ON literature_search_evidence_packages (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS literature_review_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  screening_result_id uuid NOT NULL REFERENCES screening_results(id) ON DELETE RESTRICT,
  workspace_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'READY',
  patient_segmentation_status text NOT NULL DEFAULT 'PENDING',
  patient_count integer,
  patient_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  labeling_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  causality_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  mr_review_status text NOT NULL DEFAULT 'PENDING',
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_review_workspace_status_chk
    CHECK (status IN ('READY', 'IN_REVIEW', 'REVIEW_COMPLETE', 'BLOCKED')),
  CONSTRAINT literature_review_patient_status_chk
    CHECK (patient_segmentation_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'NOT_APPLICABLE')),
  CONSTRAINT literature_review_label_status_chk
    CHECK (labeling_status IN ('NOT_CONFIGURED', 'PENDING', 'COMPLETE', 'UNRESOLVED')),
  CONSTRAINT literature_review_causality_status_chk
    CHECK (causality_status IN ('NOT_CONFIGURED', 'PENDING', 'COMPLETE', 'UNRESOLVED')),
  CONSTRAINT literature_review_mr_status_chk
    CHECK (mr_review_status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REVIEW_REQUIRED', 'EXCLUDED')),
  UNIQUE (tenant_id, package_id, screening_result_id)
);

CREATE INDEX IF NOT EXISTS idx_review_workspaces_tenant_status
  ON literature_review_workspaces (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS literature_label_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_workspace_id uuid NOT NULL REFERENCES literature_review_workspaces(id) ON DELETE CASCADE,
  patient_segment_key text NOT NULL,
  reported_product text NOT NULL,
  clinical_event text NOT NULL,
  conclusion text NOT NULL DEFAULT 'UNRESOLVED',
  reference_label_key text,
  reference_label_version text,
  reference_effective_date date,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  assessed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_label_conclusion_chk
    CHECK (conclusion IN ('EXPECTED', 'UNEXPECTED', 'UNRESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_label_assessments_workspace
  ON literature_label_assessments (tenant_id, review_workspace_id, patient_segment_key);

CREATE TABLE IF NOT EXISTS literature_causality_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_workspace_id uuid NOT NULL REFERENCES literature_review_workspaces(id) ON DELETE CASCADE,
  patient_segment_key text NOT NULL,
  reported_product text NOT NULL,
  clinical_event text NOT NULL,
  method_key text,
  method_version text,
  conclusion text NOT NULL DEFAULT 'UNRESOLVED',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  assessed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_causality_assessments_workspace
  ON literature_causality_assessments (tenant_id, review_workspace_id, patient_segment_key);

CREATE TABLE IF NOT EXISTS literature_medical_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_workspace_id uuid NOT NULL REFERENCES literature_review_workspaces(id) ON DELETE CASCADE,
  review_status text NOT NULL DEFAULT 'PENDING',
  final_decision text,
  comments text,
  reviewed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_medical_review_status_chk
    CHECK (review_status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REVIEW_REQUIRED', 'EXCLUDED')),
  UNIQUE (tenant_id, review_workspace_id)
);
