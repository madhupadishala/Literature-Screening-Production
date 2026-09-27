-- Nexus scoped-access foundation: tenant -> client workspace -> module -> user role
--
-- Security goals:
--   * a client workspace can never escape its parent tenant;
--   * a user must already be an active tenant member before workspace access can exist;
--   * a workspace can only receive a module that is present in the parent tenant entitlement set;
--   * workspace/module roles are scoped to a single workspace and environment;
--   * all mutable access-control records are versioned and auditable.
--
-- This migration is additive and does not change existing tenant-scoped records.

CREATE TABLE IF NOT EXISTS nexus_client_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_key text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_client_workspaces_key_chk
    CHECK (workspace_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  CONSTRAINT nexus_client_workspaces_configuration_object_chk
    CHECK (jsonb_typeof(configuration) = 'object'),
  UNIQUE (tenant_id, workspace_key),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_client_workspaces_tenant_status
  ON nexus_client_workspaces (tenant_id, status, display_name);

CREATE TABLE IF NOT EXISTS nexus_workspace_memberships (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_role text NOT NULL DEFAULT 'WORKSPACE_MEMBER'
    CHECK (workspace_role IN ('WORKSPACE_ADMIN', 'WORKSPACE_MEMBER', 'WORKSPACE_AUDITOR')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  UNIQUE (tenant_id, workspace_id, user_id),
  CONSTRAINT fk_nexus_workspace_membership_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_nexus_workspace_membership_tenant_member
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES tenant_memberships (tenant_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nexus_workspace_memberships_user
  ON nexus_workspace_memberships (tenant_id, user_id, status, workspace_id);

CREATE TABLE IF NOT EXISTS nexus_workspace_module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD', 'UAT', 'TRAINING')),
  module_key text NOT NULL,
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('enabled', 'disabled', 'suspended')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_workspace_module_capabilities_object_chk
    CHECK (jsonb_typeof(capabilities) = 'object'),
  CONSTRAINT nexus_workspace_module_limits_object_chk
    CHECK (jsonb_typeof(limits) = 'object'),
  CONSTRAINT nexus_workspace_module_validity_chk
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  CONSTRAINT fk_nexus_workspace_module_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_nexus_workspace_module_parent_entitlement
    FOREIGN KEY (tenant_id, environment, module_key)
    REFERENCES tenant_module_entitlements (tenant_id, environment, module_key)
    ON DELETE CASCADE,
  UNIQUE (workspace_id, environment, module_key),
  UNIQUE (tenant_id, workspace_id, environment, module_key)
);

CREATE INDEX IF NOT EXISTS idx_nexus_workspace_module_entitlements_lookup
  ON nexus_workspace_module_entitlements
  (tenant_id, workspace_id, environment, module_key, status);

CREATE TABLE IF NOT EXISTS nexus_workspace_module_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD', 'UAT', 'TRAINING')),
  module_key text NOT NULL,
  role_key text NOT NULL CHECK (role_key IN (
    'MODULE_VIEWER',
    'MODULE_OPERATOR',
    'MODULE_REVIEWER',
    'MODULE_QC',
    'MODULE_MEDICAL_REVIEWER',
    'MODULE_MANAGER',
    'MODULE_ADMIN'
  )),
  custom_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_workspace_module_roles_permissions_array_chk
    CHECK (jsonb_typeof(custom_permissions) = 'array'),
  CONSTRAINT fk_nexus_workspace_module_role_membership
    FOREIGN KEY (tenant_id, workspace_id, user_id)
    REFERENCES nexus_workspace_memberships (tenant_id, workspace_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_nexus_workspace_module_role_entitlement
    FOREIGN KEY (tenant_id, workspace_id, environment, module_key)
    REFERENCES nexus_workspace_module_entitlements
      (tenant_id, workspace_id, environment, module_key)
    ON DELETE CASCADE,
  UNIQUE (workspace_id, user_id, environment, module_key, role_key)
);

CREATE INDEX IF NOT EXISTS idx_nexus_workspace_module_roles_user
  ON nexus_workspace_module_roles
  (tenant_id, user_id, environment, workspace_id, module_key, status);

CREATE TABLE IF NOT EXISTS nexus_workspace_access_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  target_user_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  environment text CHECK (environment IS NULL OR environment IN ('PROD', 'UAT', 'TRAINING')),
  module_key text,
  change_type text NOT NULL CHECK (change_type IN (
    'WORKSPACE_CREATED',
    'WORKSPACE_UPDATED',
    'WORKSPACE_MEMBERSHIP_CHANGED',
    'WORKSPACE_MODULE_ENTITLEMENT_CHANGED',
    'WORKSPACE_MODULE_ROLE_CHANGED',
    'WORKSPACE_CONTEXT_SELECTED'
  )),
  previous_state jsonb,
  new_state jsonb,
  changed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  change_reason text NOT NULL CHECK (length(trim(change_reason)) >= 10),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_nexus_workspace_access_history_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT nexus_workspace_access_history_previous_object_chk
    CHECK (previous_state IS NULL OR jsonb_typeof(previous_state) = 'object'),
  CONSTRAINT nexus_workspace_access_history_new_object_chk
    CHECK (new_state IS NULL OR jsonb_typeof(new_state) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_nexus_workspace_access_history_tenant_time
  ON nexus_workspace_access_history (tenant_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_nexus_workspace_access_history_workspace_time
  ON nexus_workspace_access_history (tenant_id, workspace_id, changed_at DESC);


-- Carry the workspace dimension into the canonical audit trail. The composite
-- FK prevents an audit event from naming a workspace owned by another tenant.
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

DO $nexus_workspace_audit_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_audit_events_nexus_workspace'
      AND conrelid = 'audit_events'::regclass
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT fk_audit_events_nexus_workspace
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES nexus_client_workspaces (tenant_id, id)
      ON DELETE SET NULL;
  END IF;
END
$nexus_workspace_audit_fk$;

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_workspace_time
  ON audit_events (tenant_id, workspace_id, occurred_at DESC)
  WHERE workspace_id IS NOT NULL;
