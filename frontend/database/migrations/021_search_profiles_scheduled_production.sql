-- Sprint 7: governed Search Profiles and scheduled production search operations

ALTER TABLE tenant_configuration_sets
  DROP CONSTRAINT IF EXISTS tenant_configuration_sets_resource_type_check;

ALTER TABLE tenant_configuration_sets
  ADD CONSTRAINT tenant_configuration_sets_resource_type_check
  CHECK (
    resource_type = ANY (
      ARRAY[
        'PRODUCT_MASTER'::text,
        'LITERATURE_CALENDAR'::text,
        'SEARCH_PROFILE'::text,
        'CLIENT_GUIDELINE'::text,
        'OUTCOME_TEMPLATE'::text,
        'LITERATURE_SOURCE'::text,
        'LABEL_REFERENCE'::text,
        'CAUSALITY_METHOD'::text
      ]
    )
  );

ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_key_check;

ALTER TABLE tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_key_check
  CHECK (
    role_key = ANY (
      ARRAY[
        'CLINIXAI_SUPER_ADMIN'::text,
        'CLIENT_OWNER'::text,
        'CLIENT_ADMIN'::text,
        'CLIENT_IT_ADMIN'::text,
        'PV_ADMINISTRATOR'::text,
        'SUPER_USER'::text,
        'QUALITY_APPROVER'::text,
        'QC_REVIEWER'::text,
        'LITERATURE_REVIEWER'::text,
        'MEDICAL_REVIEWER'::text,
        'AUDITOR'::text,
        'READ_ONLY'::text,
        'SYSTEM_SCHEDULER'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS literature_scheduled_search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schedule_key text NOT NULL,
  calendar_version_id uuid NOT NULL REFERENCES tenant_configuration_versions(id) ON DELETE RESTRICT,
  search_profile_version_id uuid NOT NULL REFERENCES tenant_configuration_versions(id) ON DELETE RESTRICT,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  search_id uuid REFERENCES ad_hoc_literature_searches(id) ON DELETE SET NULL,
  search_evidence_package_id uuid REFERENCES literature_search_evidence_packages(id) ON DELETE SET NULL,
  result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  hits_package_count integer NOT NULL DEFAULT 0 CHECK (hits_package_count >= 0),
  hits_failed_count integer NOT NULL DEFAULT 0 CHECK (hits_failed_count >= 0),
  connector_errors jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_scheduled_search_runs_status_check
    CHECK (status IN ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED','MISSED')),
  UNIQUE (tenant_id, schedule_key, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_search_runs_tenant_schedule
  ON literature_scheduled_search_runs (tenant_id, schedule_key, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_search_runs_status
  ON literature_scheduled_search_runs (tenant_id, status, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS literature_search_schedule_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scheduled_run_id uuid REFERENCES literature_scheduled_search_runs(id) ON DELETE CASCADE,
  schedule_key text NOT NULL,
  alert_type text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  severity text NOT NULL DEFAULT 'WARNING',
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  CONSTRAINT literature_search_schedule_alerts_type_check
    CHECK (alert_type IN ('MISSED_SEARCH','FAILED_SEARCH','PARTIAL_SEARCH','CONFIGURATION_ERROR')),
  CONSTRAINT literature_search_schedule_alerts_status_check
    CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  CONSTRAINT literature_search_schedule_alerts_severity_check
    CHECK (severity IN ('INFO','WARNING','CRITICAL'))
);

CREATE INDEX IF NOT EXISTS idx_search_schedule_alerts_open
  ON literature_search_schedule_alerts (tenant_id, status, created_at DESC)
  WHERE status <> 'RESOLVED';
