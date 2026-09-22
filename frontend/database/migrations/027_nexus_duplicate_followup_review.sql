-- Nexus Sprint 6: Duplicate & Follow-Up Engine

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS duplicate_review_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (duplicate_review_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'));

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS case_relationship text
    CHECK (
      case_relationship IS NULL OR case_relationship IN (
        'NEW_CASE', 'FOLLOW_UP', 'DUPLICATE', 'NOT_MATCH'
      )
    );

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS matched_case_id uuid
    REFERENCES safety_cases(id) ON DELETE SET NULL;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS matched_intake_record_id uuid
    REFERENCES safety_intake_records(id) ON DELETE SET NULL;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS matched_external_reference text;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_at timestamptz;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_by uuid
    REFERENCES application_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS safety_duplicate_review_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  run_number integer NOT NULL CHECK (run_number > 0),
  algorithm_key text NOT NULL,
  algorithm_version text NOT NULL,
  candidate_threshold numeric(5,2) NOT NULL
    CHECK (candidate_threshold >= 0 AND candidate_threshold <= 100),
  source_snapshot jsonb NOT NULL,
  source_snapshot_sha256 text NOT NULL
    CHECK (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, intake_record_id, run_number),
  CONSTRAINT safety_duplicate_source_snapshot_object
    CHECK (jsonb_typeof(source_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_duplicate_review_runs_intake
  ON safety_duplicate_review_runs (
    tenant_id, intake_record_id, run_number DESC
  );

CREATE TABLE IF NOT EXISTS safety_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  review_run_id uuid NOT NULL REFERENCES safety_duplicate_review_runs(id) ON DELETE CASCADE,
  candidate_intake_record_id uuid NOT NULL
    REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  candidate_case_id uuid REFERENCES safety_cases(id) ON DELETE SET NULL,
  candidate_reference text NOT NULL,
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  confidence_band text NOT NULL
    CHECK (confidence_band IN ('LOW', 'MEDIUM', 'HIGH')),
  matched_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_snapshot jsonb NOT NULL,
  rank integer NOT NULL CHECK (rank > 0),
  human_candidate_decision text NOT NULL DEFAULT 'PENDING'
    CHECK (
      human_candidate_decision IN (
        'PENDING', 'NOT_MATCH', 'FOLLOW_UP_MATCH', 'DUPLICATE_MATCH'
      )
    ),
  reviewed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, review_run_id, candidate_intake_record_id),
  CONSTRAINT safety_duplicate_matched_factors_array
    CHECK (jsonb_typeof(matched_factors) = 'array'),
  CONSTRAINT safety_duplicate_candidate_snapshot_object
    CHECK (jsonb_typeof(candidate_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_duplicate_candidates_review
  ON safety_duplicate_candidates (
    tenant_id, intake_record_id, review_run_id, rank
  );

CREATE TABLE IF NOT EXISTS safety_duplicate_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  review_run_id uuid NOT NULL REFERENCES safety_duplicate_review_runs(id) ON DELETE RESTRICT,
  assessment_version integer NOT NULL CHECK (assessment_version > 0),
  system_recommendation text NOT NULL
    CHECK (system_recommendation IN ('NO_LIKELY_MATCH', 'POTENTIAL_MATCH')),
  top_candidate_score numeric(5,2)
    CHECK (top_candidate_score IS NULL OR (top_candidate_score >= 0 AND top_candidate_score <= 100)),
  human_decision text NOT NULL
    CHECK (human_decision IN ('NEW_CASE', 'FOLLOW_UP', 'DUPLICATE', 'NOT_MATCH')),
  selected_candidate_id uuid REFERENCES safety_duplicate_candidates(id) ON DELETE SET NULL,
  selected_candidate_intake_record_id uuid
    REFERENCES safety_intake_records(id) ON DELETE SET NULL,
  selected_candidate_case_id uuid
    REFERENCES safety_cases(id) ON DELETE SET NULL,
  selected_external_reference text,
  rationale text NOT NULL CHECK (length(trim(rationale)) >= 10),
  assessed_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intake_record_id, assessment_version)
);

CREATE INDEX IF NOT EXISTS idx_safety_duplicate_assessments_intake
  ON safety_duplicate_assessments (
    tenant_id, intake_record_id, assessment_version DESC
  );

CREATE INDEX IF NOT EXISTS idx_safety_intake_duplicate_worklist
  ON safety_intake_records (
    tenant_id, duplicate_review_status, duplicate_status, updated_at DESC
  );
