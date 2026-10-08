-- Postgres target for the KB (UNTESTED here; reference for production migration)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE kb_chunk (
  id BIGSERIAL PRIMARY KEY, kb TEXT NOT NULL, source TEXT NOT NULL, section_id TEXT NOT NULL,
  version TEXT NOT NULL, jurisdiction TEXT NOT NULL DEFAULT 'global',
  effective_date DATE NOT NULL, superseded_on DATE, tenant_scope TEXT, doc_type TEXT,
  text TEXT NOT NULL, sha256 TEXT NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  embedding VECTOR(1024),
  UNIQUE (source, section_id, version));
CREATE INDEX ON kb_chunk USING GIN (tsv);
CREATE INDEX ON kb_chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON kb_chunk (kb, jurisdiction, effective_date);
-- Always apply the metadata filter (kb, jurisdiction, effective/superseded dates, tenant_scope) in WHERE
-- BEFORE ranking; fuse FTS rank + vector rank with RRF; rerank top ~20 with a cross-encoder.
CREATE TABLE kb_pin (rule_chunk_key TEXT PRIMARY KEY, sha256 TEXT NOT NULL, validated_by TEXT, validated_at TIMESTAMPTZ);
