-- 039_literature_workspace_scope.sql
-- Bind newly created Literature workflow packages to the authoritative client
-- workspace/environment. Existing tenant-only rows remain NULL and are not
-- silently attributed to a client workspace; they require controlled migration.

ALTER TABLE literature_packages
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS environment text;

ALTER TABLE literature_packages
  DROP CONSTRAINT IF EXISTS literature_packages_environment_chk;
ALTER TABLE literature_packages
  ADD CONSTRAINT literature_packages_environment_chk
    CHECK (environment IS NULL OR environment IN ('PROD','UAT','TRAINING'));

ALTER TABLE literature_packages
  DROP CONSTRAINT IF EXISTS fk_literature_package_workspace;
ALTER TABLE literature_packages
  ADD CONSTRAINT fk_literature_package_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE literature_packages
  DROP CONSTRAINT IF EXISTS literature_packages_scope_pair_chk;
ALTER TABLE literature_packages
  ADD CONSTRAINT literature_packages_scope_pair_chk
    CHECK (
      (workspace_id IS NULL AND environment IS NULL)
      OR
      (workspace_id IS NOT NULL AND environment IS NOT NULL)
    );

ALTER TABLE literature_packages
  DROP CONSTRAINT IF EXISTS literature_packages_tenant_id_package_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_literature_packages_scoped_key
  ON literature_packages (tenant_id, workspace_id, environment, package_key)
  WHERE workspace_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_literature_packages_legacy_key
  ON literature_packages (tenant_id, package_key)
  WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_literature_packages_scope_status
  ON literature_packages (tenant_id, workspace_id, environment, status, updated_at DESC)
  WHERE workspace_id IS NOT NULL;

COMMENT ON COLUMN literature_packages.workspace_id IS
  'Authoritative client workspace for scoped Literature workflow data. NULL denotes legacy unassigned data that must not be relabeled automatically.';
COMMENT ON COLUMN literature_packages.environment IS
  'Authoritative PROD/UAT/TRAINING scope paired with workspace_id.';
