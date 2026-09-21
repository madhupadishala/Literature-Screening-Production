-- Nexus Sprint 4: Intake Worklist, Source Review and Extraction

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS source_review_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (source_review_status IN ('NOT_STARTED', 'IN_PROGRESS', 'VERIFIED'));

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS source_reviewed_at timestamptz;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS source_reviewed_by uuid
    REFERENCES application_users(id) ON DELETE SET NULL;

ALTER TABLE safety_source_documents
  ADD COLUMN IF NOT EXISTS extracted_text text;

ALTER TABLE safety_source_documents
  ADD COLUMN IF NOT EXISTS extracted_text_sha256 text
    CHECK (extracted_text_sha256 IS NULL OR extracted_text_sha256 ~ '^[a-f0-9]{64}$');

ALTER TABLE safety_source_documents
  ADD COLUMN IF NOT EXISTS extracted_page_count integer
    CHECK (extracted_page_count IS NULL OR extracted_page_count > 0);

ALTER TABLE safety_source_documents
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

ALTER TABLE safety_source_documents
  ADD COLUMN IF NOT EXISTS extraction_engine text;

ALTER TABLE safety_source_documents
  ADD COLUMN IF NOT EXISTS extraction_error text;

CREATE TABLE IF NOT EXISTS safety_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  document_id uuid REFERENCES safety_source_documents(id) ON DELETE CASCADE,
  run_number integer NOT NULL CHECK (run_number > 0),
  parser_key text NOT NULL,
  parser_version text NOT NULL,
  extractor_key text NOT NULL,
  extractor_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  extracted_text_sha256 text
    CHECK (extracted_text_sha256 IS NULL OR extracted_text_sha256 ~ '^[a-f0-9]{64}$'),
  suggestion_count integer NOT NULL DEFAULT 0 CHECK (suggestion_count >= 0),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, intake_record_id, run_number)
);

CREATE INDEX IF NOT EXISTS idx_safety_extraction_runs_intake
  ON safety_extraction_runs (tenant_id, intake_record_id, run_number DESC);

CREATE TABLE IF NOT EXISTS safety_extraction_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  extraction_run_id uuid NOT NULL REFERENCES safety_extraction_runs(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (
    suggestion_type IN ('PATIENT', 'REPORTER', 'PRODUCT', 'EVENT', 'TEST')
  ),
  entity_key text NOT NULL,
  suggested_payload jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_text text NOT NULL,
  source_locator jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED')
  ),
  final_payload jsonb,
  reviewed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, extraction_run_id, suggestion_type, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_extraction_suggestions_review
  ON safety_extraction_suggestions (
    tenant_id, intake_record_id, status, suggestion_type, created_at
  );
