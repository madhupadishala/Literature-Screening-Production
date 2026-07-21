ALTER TABLE tenant_memberships
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'active'
    CHECK (membership_status IN ('active', 'disabled')),
  ADD COLUMN IF NOT EXISTS membership_version integer NOT NULL DEFAULT 1
    CHECK (membership_version > 0),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_key_check;

ALTER TABLE tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_key_check CHECK (role_key IN (
    'CLINIXAI_SUPER_ADMIN', 'CLIENT_OWNER', 'CLIENT_ADMIN', 'CLIENT_IT_ADMIN',
    'PV_ADMINISTRATOR', 'SUPER_USER', 'QUALITY_APPROVER', 'QC_REVIEWER',
    'LITERATURE_REVIEWER', 'AUDITOR', 'READ_ONLY'
  ));

ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_permissions_array_check;

ALTER TABLE tenant_memberships
  ADD CONSTRAINT tenant_memberships_permissions_array_check
    CHECK (jsonb_typeof(permissions) = 'array');

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_status
  ON tenant_memberships (tenant_id, membership_status, role_key);

CREATE TABLE IF NOT EXISTS tenant_membership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  membership_version integer NOT NULL CHECK (membership_version > 0),
  role_key text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  membership_status text NOT NULL CHECK (membership_status IN ('active', 'disabled')),
  changed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  change_reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, membership_version)
);

CREATE INDEX IF NOT EXISTS idx_membership_history_tenant_time
  ON tenant_membership_history (tenant_id, changed_at DESC);
