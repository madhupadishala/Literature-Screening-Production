-- Nexus Sprint 8: L2A Case Processing

ALTER TABLE safety_cases
  DROP CONSTRAINT IF EXISTS safety_cases_case_status_check;

ALTER TABLE safety_cases
  ADD CONSTRAINT safety_cases_case_status_check
    CHECK (case_status IN (
      'OPEN',
      'IN_PROCESS',
      'QC_REVIEW',
      'MEDICAL_REVIEW',
      'FINALIZED',
      'SUBMITTED',
      'CLOSED',
      'VOID',
      'NEW',
      'ASSIGNED',
      'PROCESSING',
      'READY_FOR_QC',
      'QC_RETURNED',
      'QC_APPROVED',
      'FINAL'
    ));

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS current_draft_revision integer NOT NULL DEFAULT 0
    CHECK (current_draft_revision >= 0);

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS assigned_to uuid
    REFERENCES application_users(id) ON DELETE SET NULL;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS ready_for_qc_at timestamptz;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS final_version_id uuid;

CREATE TABLE IF NOT EXISTS safety_case_draft_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  draft_payload jsonb NOT NULL,
  draft_sha256 text NOT NULL CHECK (draft_sha256 ~ '^[a-f0-9]{64}$'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) >= 10),
  source_kind text NOT NULL DEFAULT 'PROCESSOR'
    CHECK (source_kind IN (
      'INTAKE_SEED',
      'PROCESSOR',
      'QC_CORRECTION',
      'MEDICAL_CORRECTION',
      'FOLLOW_UP_MERGE'
    )),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_id, revision),
  CONSTRAINT safety_case_draft_payload_object
    CHECK (jsonb_typeof(draft_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_case_drafts_case
  ON safety_case_draft_versions (tenant_id, case_id, revision DESC);

CREATE TABLE IF NOT EXISTS safety_case_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  event_key text NOT NULL,
  assessment_type text NOT NULL CHECK (
    assessment_type IN (
      'CAUSALITY',
      'REPORTER_CAUSALITY',
      'COMPANY_CAUSALITY',
      'EXPECTEDNESS',
      'LISTEDNESS',
      'SERIOUSNESS_SUPPORT'
    )
  ),
  result text NOT NULL,
  rationale text NOT NULL CHECK (length(trim(rationale)) >= 10),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessment_version integer NOT NULL CHECK (assessment_version > 0),
  assessed_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    case_id,
    product_key,
    event_key,
    assessment_type,
    assessment_version
  ),
  CONSTRAINT safety_case_assessment_evidence_object
    CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_case_assessments_case
  ON safety_case_assessments (
    tenant_id, case_id, product_key, event_key, assessment_type, assessment_version DESC
  );

CREATE TABLE IF NOT EXISTS safety_case_narrative_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  narrative_version integer NOT NULL CHECK (narrative_version > 0),
  narrative_stage text NOT NULL CHECK (
    narrative_stage IN (
      'SOURCE_FACTS',
      'SYSTEM_DRAFT',
      'PROCESSOR',
      'QC',
      'MEDICAL_REVIEW',
      'FINAL'
    )
  ),
  narrative_text text NOT NULL CHECK (length(trim(narrative_text)) >= 10),
  source_revision integer,
  change_reason text NOT NULL CHECK (length(trim(change_reason)) >= 10),
  narrative_sha256 text NOT NULL CHECK (narrative_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_id, narrative_version)
);

CREATE INDEX IF NOT EXISTS idx_safety_case_narratives_case
  ON safety_case_narrative_versions (
    tenant_id, case_id, narrative_version DESC
  );

CREATE TABLE IF NOT EXISTS safety_case_assist_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  suggestion_type text NOT NULL CHECK (
    suggestion_type IN (
      'MISSING_INFORMATION',
      'SERIOUSNESS_SUPPORT',
      'CAUSALITY_SUPPORT',
      'EXPECTEDNESS_SUPPORT',
      'CODING_REVIEW',
      'NARRATIVE_DRAFT'
    )
  ),
  suggestion_payload jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED')),
  human_payload jsonb,
  review_reason text,
  reviewed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_case_assist_payload_object
    CHECK (jsonb_typeof(suggestion_payload) = 'object'),
  CONSTRAINT safety_case_assist_evidence_object
    CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT safety_case_assist_human_payload_object
    CHECK (human_payload IS NULL OR jsonb_typeof(human_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_case_assist_case
  ON safety_case_assist_suggestions (
    tenant_id, case_id, draft_revision, status, created_at
  );

CREATE TABLE IF NOT EXISTS safety_case_followup_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  status text NOT NULL DEFAULT 'ATTACHED'
    CHECK (status IN ('ATTACHED', 'MERGED', 'PROCESSED', 'REJECTED')),
  merge_revision integer,
  attached_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  attached_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intake_record_id),
  UNIQUE (tenant_id, case_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_safety_case_followups_case
  ON safety_case_followup_links (
    tenant_id, case_id, sequence_number DESC
  );

ALTER TABLE safety_cases
  DROP CONSTRAINT IF EXISTS safety_cases_final_version_id_fkey;

ALTER TABLE safety_cases
  ADD CONSTRAINT safety_cases_final_version_id_fkey
    FOREIGN KEY (final_version_id)
    REFERENCES safety_case_versions(id)
    ON DELETE SET NULL;
