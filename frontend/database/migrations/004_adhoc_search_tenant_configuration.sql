CREATE TABLE IF NOT EXISTS tenant_configuration_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (
    resource_type IN (
      'PRODUCT_MASTER',
      'LITERATURE_CALENDAR',
      'CLIENT_GUIDELINE',
      'OUTCOME_TEMPLATE',
      'LITERATURE_SOURCE'
    )
  ),
  config_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, resource_type, config_key)
);

CREATE TABLE IF NOT EXISTS configuration_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  original_filename text NOT NULL,
  media_type text,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  processing_status text NOT NULL DEFAULT 'uploaded'
    CHECK (
      processing_status IN (
        'uploaded',
        'parsed',
        'validated',
        'quarantined',
        'failed'
      )
    ),
  failure_code text,
  failure_reason text,
  uploaded_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_set_id uuid NOT NULL REFERENCES tenant_configuration_sets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  version_label text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (
      lifecycle_status IN (
        'draft',
        'validated',
        'approved',
        'active',
        'superseded',
        'retired',
        'rejected'
      )
    ),
  effective_from timestamptz,
  effective_to timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL,
  upload_id uuid REFERENCES configuration_uploads(id) ON DELETE SET NULL,
  source_filename text,
  source_media_type text,
  source_storage_key text,
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason text,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  validated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  validated_at timestamptz,
  approved_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  activated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_set_id, version_number),
  UNIQUE (config_set_id, version_label)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_tenant_configuration_version
  ON tenant_configuration_versions (config_set_id)
  WHERE lifecycle_status = 'active';

CREATE TABLE IF NOT EXISTS literature_source_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  display_name text NOT NULL,
  connector_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  base_url text NOT NULL,
  credential_reference text,
  max_results integer NOT NULL DEFAULT 100
    CHECK (max_results BETWEEN 1 AND 1000),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_key)
);

CREATE TABLE IF NOT EXISTS ad_hoc_literature_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_key text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  executed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  criteria jsonb NOT NULL,
  selected_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  translated_queries jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  selected_count integer NOT NULL DEFAULT 0 CHECK (selected_count >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  connector_errors jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS ad_hoc_literature_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES ad_hoc_literature_searches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_record_id text NOT NULL,
  pmid text,
  doi text,
  title text NOT NULL,
  authors jsonb NOT NULL DEFAULT '[]'::jsonb,
  journal text,
  publication_date date,
  language text,
  publication_type text,
  abstract_text text,
  landing_url text,
  full_text_status text NOT NULL DEFAULT 'unknown',
  match_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  duplicate_group text,
  selected boolean NOT NULL DEFAULT false,
  evidence_package_id uuid REFERENCES literature_packages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, source_key, source_record_id)
);

CREATE TABLE IF NOT EXISTS package_configuration_snapshots (
  package_id uuid PRIMARY KEY REFERENCES literature_packages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  search_execution_id uuid REFERENCES ad_hoc_literature_searches(id) ON DELETE SET NULL,
  product_master_version_id uuid REFERENCES tenant_configuration_versions(id) ON DELETE SET NULL,
  literature_calendar_version_id uuid REFERENCES tenant_configuration_versions(id) ON DELETE SET NULL,
  client_guideline_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome_template_version_id uuid REFERENCES tenant_configuration_versions(id) ON DELETE SET NULL,
  snapshot_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_configuration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  config_set_id uuid REFERENCES tenant_configuration_sets(id) ON DELETE SET NULL,
  config_version_id uuid REFERENCES tenant_configuration_versions(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_configuration_sets_tenant_type
  ON tenant_configuration_sets (tenant_id, resource_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_configuration_versions_set_status
  ON tenant_configuration_versions (config_set_id, lifecycle_status, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_configuration_uploads_tenant_time
  ON configuration_uploads (tenant_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_literature_sources_tenant_enabled
  ON literature_source_connectors (tenant_id, enabled, source_key);
CREATE INDEX IF NOT EXISTS idx_adhoc_searches_tenant_time
  ON ad_hoc_literature_searches (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adhoc_results_search
  ON ad_hoc_literature_results (search_id, source_key, created_at);
CREATE INDEX IF NOT EXISTS idx_adhoc_results_identity
  ON ad_hoc_literature_results (tenant_id, doi, pmid);
CREATE INDEX IF NOT EXISTS idx_configuration_audit_tenant_time
  ON tenant_configuration_audit (tenant_id, occurred_at DESC);
