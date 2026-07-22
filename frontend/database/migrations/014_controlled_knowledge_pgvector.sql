CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS controlled_knowledge_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  repository_key text NOT NULL,
  version_label text NOT NULL,
  lifecycle_status text NOT NULL
    CHECK (lifecycle_status IN ('loading', 'active', 'superseded', 'failed')),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  checksum_manifest_sha256 text NOT NULL CHECK (checksum_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  approved_object_count integer NOT NULL CHECK (approved_object_count >= 0),
  excluded_draft_object_count integer NOT NULL CHECK (excluded_draft_object_count >= 0),
  indexed_chunk_count integer NOT NULL CHECK (indexed_chunk_count >= 0),
  excluded_draft_chunk_count integer NOT NULL CHECK (excluded_draft_chunk_count >= 0),
  embedding_provider text NOT NULL,
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions > 0),
  loaded_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  loaded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, repository_key, version_label)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_controlled_knowledge_active_repository
  ON controlled_knowledge_repositories (tenant_id, repository_key)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_controlled_knowledge_repository_status
  ON controlled_knowledge_repositories (tenant_id, lifecycle_status, loaded_at DESC);

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS controlled_repository_id uuid
    REFERENCES controlled_knowledge_repositories(id) ON DELETE CASCADE;

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS production_eligible boolean NOT NULL DEFAULT false;

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS chunk_key text;

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS content_sha256 text;

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_dimensions integer;

ALTER TABLE knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_content_sha256_format;

ALTER TABLE knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_content_sha256_format
  CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$');

ALTER TABLE knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_embedding_dimensions_positive;

ALTER TABLE knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_embedding_dimensions_positive
  CHECK (embedding_dimensions IS NULL OR embedding_dimensions > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_tenant_chunk_key
  ON knowledge_chunks (tenant_id, chunk_key)
  WHERE chunk_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_controlled_repository
  ON knowledge_documents (tenant_id, controlled_repository_id, production_eligible);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_model
  ON knowledge_chunks (tenant_id, embedding_model, embedding_dimensions)
  WHERE embedding IS NOT NULL;
