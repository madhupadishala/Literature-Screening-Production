CREATE TABLE IF NOT EXISTS literature_package_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  search_result_id uuid REFERENCES ad_hoc_literature_results(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  source_record_id text NOT NULL,
  pmid text,
  doi text,
  landing_url text,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_id, source_key, source_record_id)
);

CREATE TABLE IF NOT EXISTS duplicate_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_result_id uuid NOT NULL REFERENCES ad_hoc_literature_results(id) ON DELETE CASCADE,
  canonical_package_id uuid REFERENCES literature_packages(id) ON DELETE SET NULL,
  classification text NOT NULL
    CHECK (classification IN ('unique', 'duplicate', 'possible_duplicate')),
  confidence numeric(5,4) NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  match_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  assessed_by text NOT NULL DEFAULT 'DETERMINISTIC_IDENTITY_ENGINE',
  assessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, candidate_result_id)
);

CREATE INDEX IF NOT EXISTS idx_package_sources_identity
  ON literature_package_sources (tenant_id, pmid, doi);

CREATE INDEX IF NOT EXISTS idx_duplicate_assessments_package
  ON duplicate_assessments (tenant_id, canonical_package_id, classification);

CREATE INDEX IF NOT EXISTS idx_duplicate_assessments_time
  ON duplicate_assessments (tenant_id, assessed_at DESC);
