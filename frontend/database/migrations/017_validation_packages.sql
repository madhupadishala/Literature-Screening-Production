-- Sprint 4: decouple validation snapshots from operational Hits handoff.
-- Validation Packages preserve immutable search/configuration evidence without
-- creating a literature workflow package or Hits work item.

CREATE TABLE IF NOT EXISTS literature_validation_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  validation_key text NOT NULL,
  search_id uuid NOT NULL REFERENCES ad_hoc_literature_searches(id) ON DELETE RESTRICT,
  identity_key text NOT NULL,
  selected_result_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL,
  content_sha256 text NOT NULL,
  handoff_package_id uuid REFERENCES literature_packages(id) ON DELETE SET NULL,
  handed_off_at timestamptz,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, validation_key)
);

CREATE INDEX IF NOT EXISTS idx_validation_packages_tenant_time
  ON literature_validation_packages (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_packages_identity
  ON literature_validation_packages (tenant_id, identity_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_packages_search
  ON literature_validation_packages (tenant_id, search_id, created_at DESC);
