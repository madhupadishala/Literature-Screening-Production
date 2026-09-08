CREATE TABLE IF NOT EXISTS stored_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL,
  document_type text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  document_version integer NOT NULL DEFAULT 1 CHECK (document_version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  module text,
  source_id text,
  pmid text,
  doi text,
  evidence_package_id text,
  retention_policy text NOT NULL CHECK (retention_policy IN ('retain', 'temporary', 'selective', 'regenerable')),
  retention_until timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  delete_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_key)
);

CREATE TABLE IF NOT EXISTS stored_document_contents (
  document_id uuid PRIMARY KEY REFERENCES stored_documents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stored_documents_tenant_status
  ON stored_documents (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stored_documents_retention
  ON stored_documents (tenant_id, retention_until) WHERE status = 'active';
