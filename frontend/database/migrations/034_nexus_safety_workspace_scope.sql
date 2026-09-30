-- 034_nexus_safety_workspace_scope.sql
-- Cleanup Sprint 6: bind regulated Safety roots to the selected client workspace/environment.
--
-- Zero-deviation / migration rule:
--   Existing rows are NOT guessed into a workspace.
--   New or reconciled rows must carry workspace_id + environment.
--   Historical rows remain NULL until a controlled mapping/rehearsal assigns them.
--   Production rollout must map legacy rows before enabling workspace-only access.

ALTER TABLE safety_sources
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS environment text;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS environment text;

ALTER TABLE safety_cases
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS environment text;

ALTER TABLE intake_input_exports
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS environment text;

DO $safety_workspace_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'safety_sources_environment_chk'
      AND conrelid = 'safety_sources'::regclass
  ) THEN
    ALTER TABLE safety_sources
      ADD CONSTRAINT safety_sources_environment_chk
      CHECK (environment IS NULL OR environment IN ('PROD','UAT','TRAINING'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'safety_intake_environment_chk'
      AND conrelid = 'safety_intake_records'::regclass
  ) THEN
    ALTER TABLE safety_intake_records
      ADD CONSTRAINT safety_intake_environment_chk
      CHECK (environment IS NULL OR environment IN ('PROD','UAT','TRAINING'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'safety_cases_environment_chk'
      AND conrelid = 'safety_cases'::regclass
  ) THEN
    ALTER TABLE safety_cases
      ADD CONSTRAINT safety_cases_environment_chk
      CHECK (environment IS NULL OR environment IN ('PROD','UAT','TRAINING'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intake_input_exports_environment_chk'
      AND conrelid = 'intake_input_exports'::regclass
  ) THEN
    ALTER TABLE intake_input_exports
      ADD CONSTRAINT intake_input_exports_environment_chk
      CHECK (environment IS NULL OR environment IN ('PROD','UAT','TRAINING'));
  END IF;
END
$safety_workspace_checks$;

DO $safety_workspace_fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_safety_sources_workspace'
  ) THEN
    ALTER TABLE safety_sources
      ADD CONSTRAINT fk_safety_sources_workspace
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES nexus_client_workspaces (tenant_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_safety_intake_workspace'
  ) THEN
    ALTER TABLE safety_intake_records
      ADD CONSTRAINT fk_safety_intake_workspace
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES nexus_client_workspaces (tenant_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_safety_cases_workspace'
  ) THEN
    ALTER TABLE safety_cases
      ADD CONSTRAINT fk_safety_cases_workspace
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES nexus_client_workspaces (tenant_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_intake_input_exports_workspace'
  ) THEN
    ALTER TABLE intake_input_exports
      ADD CONSTRAINT fk_intake_input_exports_workspace
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES nexus_client_workspaces (tenant_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$safety_workspace_fks$;

-- Replace tenant-global business-key uniqueness with workspace/environment scope.
ALTER TABLE safety_sources
  DROP CONSTRAINT IF EXISTS safety_sources_tenant_id_source_key_key;
ALTER TABLE safety_intake_records
  DROP CONSTRAINT IF EXISTS safety_intake_records_tenant_id_intake_key_key;
ALTER TABLE safety_intake_records
  DROP CONSTRAINT IF EXISTS safety_intake_records_tenant_id_source_id_source_record_key_key;
ALTER TABLE safety_cases
  DROP CONSTRAINT IF EXISTS safety_cases_tenant_id_case_key_key;
ALTER TABLE safety_cases
  DROP CONSTRAINT IF EXISTS safety_cases_tenant_id_intake_record_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_sources_scope_key
  ON safety_sources (tenant_id, workspace_id, environment, source_key)
  WHERE workspace_id IS NOT NULL AND environment IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_intake_scope_key
  ON safety_intake_records (tenant_id, workspace_id, environment, intake_key)
  WHERE workspace_id IS NOT NULL AND environment IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_intake_scope_source_record
  ON safety_intake_records
  (tenant_id, workspace_id, environment, source_id, source_record_key)
  WHERE workspace_id IS NOT NULL AND environment IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_cases_scope_key
  ON safety_cases (tenant_id, workspace_id, environment, case_key)
  WHERE workspace_id IS NOT NULL AND environment IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_cases_scope_intake
  ON safety_cases (tenant_id, workspace_id, environment, intake_record_id)
  WHERE workspace_id IS NOT NULL AND environment IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_sources_workspace_scope
  ON safety_sources (tenant_id, workspace_id, environment, received_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_intake_workspace_scope
  ON safety_intake_records (tenant_id, workspace_id, environment, status, updated_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_safety_cases_workspace_scope
  ON safety_cases (tenant_id, workspace_id, environment, case_status, updated_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intake_input_exports_workspace_scope
  ON intake_input_exports (tenant_id, workspace_id, environment, generated_at DESC)
  WHERE workspace_id IS NOT NULL;

COMMENT ON COLUMN safety_sources.workspace_id IS
  'Client workspace authority. NULL only for legacy rows pending controlled migration mapping.';
COMMENT ON COLUMN safety_intake_records.workspace_id IS
  'Client workspace authority. NULL only for legacy rows pending controlled migration mapping.';
COMMENT ON COLUMN safety_cases.workspace_id IS
  'Client workspace authority. NULL only for legacy rows pending controlled migration mapping.';
COMMENT ON COLUMN intake_input_exports.workspace_id IS
  'Workspace that generated/owns the immutable Literature-to-Intake handoff.';
