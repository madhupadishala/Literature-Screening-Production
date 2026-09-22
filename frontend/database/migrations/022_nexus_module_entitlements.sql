CREATE TABLE IF NOT EXISTS platform_role_assignments (
  user_id uuid PRIMARY KEY REFERENCES application_users(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK (role_key IN (
    'PLATFORM_SUPER_ADMIN',
    'PLATFORM_SECURITY_ADMIN',
    'PLATFORM_QA_ADMIN',
    'PLATFORM_SUPPORT',
    'PLATFORM_AUDITOR'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_role_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  version integer NOT NULL CHECK (version > 0),
  changed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  change_reason text NOT NULL CHECK (length(trim(change_reason)) > 0),
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

CREATE INDEX IF NOT EXISTS idx_platform_role_assignments_role_status
  ON platform_role_assignments (role_key, status);

-- Migrate existing ClinixAI Super Admin identities into the platform scope.
-- Client roles remain tenant-scoped and receive no platform authority.
INSERT INTO platform_role_assignments (user_id, role_key, status)
SELECT DISTINCT m.user_id, 'PLATFORM_SUPER_ADMIN', 'active'
FROM tenant_memberships m
WHERE m.role_key = 'CLINIXAI_SUPER_ADMIN'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
  CONSTRAINT tenant_module_entitlements_capabilities_object
    CHECK (jsonb_typeof(capabilities) = 'object'),
  CONSTRAINT tenant_module_entitlements_limits_object
    CHECK (jsonb_typeof(limits) = 'object'),
  CONSTRAINT tenant_module_entitlements_validity
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  UNIQUE (tenant_id, environment, module_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_entitlements_lookup
  ON tenant_module_entitlements (tenant_id, environment, module_key, status);

CREATE TABLE IF NOT EXISTS tenant_module_entitlement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('PROD', 'UAT', 'TRAINING')),
  module_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('enabled', 'disabled', 'suspended')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  changed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  change_reason text NOT NULL CHECK (length(trim(change_reason)) > 0),
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, environment, module_key, version)
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_entitlement_history_lookup
  ON tenant_module_entitlement_history (tenant_id, environment, module_key, changed_at DESC);

-- Preserve the current Literature product for all existing tenants while
-- moving access control to explicit module entitlements. New Nexus modules
-- remain disabled until deliberately licensed and activated.
INSERT INTO tenant_module_entitlements (
  tenant_id, environment, module_key, status, capabilities, limits, version
)
SELECT t.id, env.environment, 'LITERATURE', 'enabled', '{}'::jsonb, '{}'::jsonb, 1
FROM tenants t
CROSS JOIN (
  VALUES ('PROD'::text), ('UAT'::text), ('TRAINING'::text)
) AS env(environment)
ON CONFLICT (tenant_id, environment, module_key) DO NOTHING;
