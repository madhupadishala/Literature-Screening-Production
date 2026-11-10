-- Migration 043: Platform Roles
-- Adds platform-level role assignments for unified RBAC system

-- Platform role assignments table
CREATE TABLE IF NOT EXISTS platform_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK (role_key IN (
    'PLATFORM_SUPER_ADMIN', 'PLATFORM_SECURITY_ADMIN', 'PLATFORM_QA_ADMIN',
    'PLATFORM_SUPPORT', 'PLATFORM_AUDITOR'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  granted_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_role_assignments_user
  ON platform_role_assignments (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_platform_role_assignments_role
  ON platform_role_assignments (role_key) WHERE status = 'active';

-- History table for platform role changes
CREATE TABLE IF NOT EXISTS platform_role_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  changed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  change_reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_role_history_user_time
  ON platform_role_assignment_history (user_id, changed_at DESC);