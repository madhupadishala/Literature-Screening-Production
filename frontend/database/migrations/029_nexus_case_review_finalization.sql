-- Nexus Sprint 9: QC, Medical Review and Finalization

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS finalized_by uuid
    REFERENCES application_users(id) ON DELETE SET NULL;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS qc_approved_at timestamptz;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS medical_review_approved_at timestamptz;

CREATE TABLE IF NOT EXISTS safety_case_review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  review_type text NOT NULL CHECK (
    review_type IN ('QC', 'MEDICAL_REVIEW', 'FINALIZATION')
  ),
  review_cycle integer NOT NULL CHECK (review_cycle > 0),
  action_type text NOT NULL CHECK (
    action_type IN (
      'SUBMIT',
      'APPROVE',
      'RETURN',
      'QUERY',
      'COMMENT',
      'FINALIZE'
    )
  ),
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  narrative_version integer,
  field_path text,
  comments text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  acted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_case_review_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_case_review_actions
  ON safety_case_review_actions (
    tenant_id, case_id, review_type, review_cycle, acted_at DESC
  );

CREATE TABLE IF NOT EXISTS safety_case_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  review_type text NOT NULL CHECK (
    review_type IN ('QC', 'MEDICAL_REVIEW')
  ),
  review_cycle integer NOT NULL CHECK (review_cycle > 0),
  field_path text,
  query_text text NOT NULL CHECK (length(trim(query_text)) >= 5),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'RESOLVED', 'CANCELLED')),
  response_text text,
  raised_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  raised_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_safety_case_queries_open
  ON safety_case_queries (
    tenant_id, case_id, status, review_type, raised_at DESC
  );

CREATE TABLE IF NOT EXISTS safety_case_finalization_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  check_version integer NOT NULL CHECK (check_version > 0),
  ready boolean NOT NULL,
  checks jsonb NOT NULL,
  checked_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_id, check_version),
  CONSTRAINT safety_case_finalization_checks_array
    CHECK (jsonb_typeof(checks) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_safety_case_finalization_checks_case
  ON safety_case_finalization_checks (
    tenant_id, case_id, check_version DESC
  );
