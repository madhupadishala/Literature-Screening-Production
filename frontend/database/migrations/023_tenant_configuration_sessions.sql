CREATE TABLE IF NOT EXISTS tenant_runtime_configurations (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  configuration jsonb NOT NULL,
  configuration_version integer NOT NULL DEFAULT 1 CHECK (configuration_version > 0),
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  flag_version integer NOT NULL DEFAULT 1 CHECK (flag_version > 0),
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_key)
);

CREATE TABLE IF NOT EXISTS authentication_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  role_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  refresh_token_sha256 text NOT NULL CHECK (length(refresh_token_sha256) = 64),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  refreshed_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT authentication_sessions_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_authentication_sessions_active
  ON authentication_sessions (tenant_id, user_id, status, expires_at);
