CREATE TABLE IF NOT EXISTS intake_input_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  screening_result_id uuid NOT NULL REFERENCES screening_results(id) ON DELETE RESTRICT,
  screening_review_id uuid NOT NULL REFERENCES screening_reviews(id) ON DELETE RESTRICT,
  export_version integer NOT NULL CHECK (export_version > 0),
  schema_version text NOT NULL,
  file_name text NOT NULL DEFAULT 'intake_input.json',
  payload jsonb NOT NULL,
  content text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source_lineage_sha256 text NOT NULL CHECK (source_lineage_sha256 ~ '^[a-f0-9]{64}$'),
  generated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_id, export_version),
  UNIQUE (tenant_id, package_id, source_lineage_sha256)
);

CREATE INDEX IF NOT EXISTS idx_intake_input_exports_package
  ON intake_input_exports (tenant_id, package_id, export_version DESC);

CREATE INDEX IF NOT EXISTS idx_intake_input_exports_screening
  ON intake_input_exports (tenant_id, screening_result_id, screening_review_id);
