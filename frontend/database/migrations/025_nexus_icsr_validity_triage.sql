-- Nexus Sprint 5: ICSR Validity + Triage

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS triage_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (triage_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'));

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS triage_outcome text
    CHECK (
      triage_outcome IS NULL OR triage_outcome IN (
        'READY_FOR_DUPLICATE_REVIEW',
        'FOLLOW_UP_REQUIRED',
        'NOT_VALID_ICSR',
        'HOLD_FOR_CLARIFICATION'
      )
    );

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS follow_up_required boolean NOT NULL DEFAULT false;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS special_situations jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS triaged_by uuid
    REFERENCES application_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS safety_triage_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  assessment_version integer NOT NULL CHECK (assessment_version > 0),

  system_validity_recommendation text NOT NULL
    CHECK (system_validity_recommendation IN ('VALID', 'UNRESOLVED')),
  minimum_criteria jsonb NOT NULL,
  human_minimum_criteria jsonb NOT NULL,
  system_snapshot jsonb NOT NULL,

  human_validity_decision text NOT NULL
    CHECK (human_validity_decision IN ('VALID', 'INVALID', 'UNRESOLVED')),

  seriousness_status text NOT NULL
    CHECK (seriousness_status IN ('SERIOUS', 'NON_SERIOUS', 'UNRESOLVED')),
  seriousness_criteria jsonb NOT NULL,

  special_situations jsonb NOT NULL DEFAULT '[]'::jsonb,

  priority text NOT NULL
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),

  follow_up_required boolean NOT NULL,
  follow_up_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,

  triage_outcome text NOT NULL
    CHECK (triage_outcome IN (
      'READY_FOR_DUPLICATE_REVIEW',
      'FOLLOW_UP_REQUIRED',
      'NOT_VALID_ICSR',
      'HOLD_FOR_CLARIFICATION'
    )),

  rationale text NOT NULL CHECK (length(trim(rationale)) >= 10),
  assessed_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  assessed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, intake_record_id, assessment_version),

  CONSTRAINT safety_triage_minimum_criteria_object
    CHECK (jsonb_typeof(minimum_criteria) = 'object'),
  CONSTRAINT safety_triage_human_minimum_criteria_array
    CHECK (jsonb_typeof(human_minimum_criteria) = 'array'),
  CONSTRAINT safety_triage_system_snapshot_object
    CHECK (jsonb_typeof(system_snapshot) = 'object'),
  CONSTRAINT safety_triage_seriousness_object
    CHECK (jsonb_typeof(seriousness_criteria) = 'object'),
  CONSTRAINT safety_triage_special_situations_array
    CHECK (jsonb_typeof(special_situations) = 'array'),
  CONSTRAINT safety_triage_follow_up_reasons_array
    CHECK (jsonb_typeof(follow_up_reasons) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_safety_triage_assessments_intake
  ON safety_triage_assessments (
    tenant_id, intake_record_id, assessment_version DESC
  );

CREATE INDEX IF NOT EXISTS idx_safety_intake_triage_worklist
  ON safety_intake_records (
    tenant_id, triage_status, validity_status, seriousness_status, priority, updated_at DESC
  );
