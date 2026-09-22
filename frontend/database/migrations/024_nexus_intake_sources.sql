-- Nexus Sprint 3: Intake Sources
-- Persists immutable source documents used by Document Intake.
-- Extraction/interpretation is deliberately deferred to Sprint 4.

CREATE TABLE IF NOT EXISTS safety_source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES safety_sources(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  document_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  )),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  content_bytes bytea NOT NULL,
  original_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_status text NOT NULL DEFAULT 'PENDING' CHECK (
    extraction_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'NOT_REQUIRED')
  ),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_key),
  UNIQUE (tenant_id, source_id, content_sha256)
);

CREATE INDEX IF NOT EXISTS idx_safety_source_documents_intake
  ON safety_source_documents (tenant_id, intake_record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_source_documents_extraction
  ON safety_source_documents (tenant_id, extraction_status, created_at);
