-- 015_authentication_credentials.sql
-- Adds real credential storage to application_users so login can verify a
-- password instead of trusting a client-supplied identity/role.

ALTER TABLE application_users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

COMMENT ON COLUMN application_users.password_hash IS
  'bcrypt hash. NULL means the account cannot authenticate via password (e.g. SSO-only or not yet provisioned).';

CREATE INDEX IF NOT EXISTS idx_application_users_email_lower
  ON application_users (lower(email));
