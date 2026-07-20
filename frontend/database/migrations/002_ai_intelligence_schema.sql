CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_key text NOT NULL,
  title text NOT NULL,
  source_type text NOT NULL,
  source_reference text,
  effective_from date,
  effective_to date,
  version_label text NOT NULL,
  governance_status text NOT NULL DEFAULT 'draft'
    CHECK (governance_status IN ('draft', 'approved', 'effective', 'retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_key, version_label)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  embedding_model text,
  embedding vector,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL,
  version_label text NOT NULL,
  prompt_sha256 text NOT NULL,
  prompt_template text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  approved_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_key, version_label)
);

CREATE TABLE IF NOT EXISTS ai_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid REFERENCES literature_packages(id) ON DELETE CASCADE,
  execution_type text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  request_id text,
  input_sha256 text,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'cancelled')),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS hits_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES ai_executions(id) ON DELETE SET NULL,
  result_version integer NOT NULL DEFAULT 1 CHECK (result_version > 0),
  result_payload jsonb NOT NULL,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, result_version)
);

CREATE TABLE IF NOT EXISTS screening_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES ai_executions(id) ON DELETE SET NULL,
  result_version integer NOT NULL DEFAULT 1 CHECK (result_version > 0),
  decision text,
  result_payload jsonb NOT NULL,
  confidence numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, result_version)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_status
  ON knowledge_documents (tenant_id, governance_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document
  ON knowledge_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_ai_executions_package_time
  ON ai_executions (tenant_id, package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hits_results_package
  ON hits_results (tenant_id, package_id, result_version DESC);
CREATE INDEX IF NOT EXISTS idx_screening_results_package
  ON screening_results (tenant_id, package_id, result_version DESC);
