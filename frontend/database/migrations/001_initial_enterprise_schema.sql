CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject text UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS literature_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  package_key text NOT NULL,
  source_type text NOT NULL,
  external_reference text,
  article_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'NEW',
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_key)
);

CREATE TABLE IF NOT EXISTS literature_workflow_state (
  package_id uuid PRIMARY KEY REFERENCES literature_packages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_state text NOT NULL,
  state_version integer NOT NULL DEFAULT 1 CHECK (state_version > 0),
  state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  storage_backend text NOT NULL,
  storage_key text NOT NULL,
  media_type text,
  sha256 text NOT NULL,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_id, artifact_type, storage_key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  package_id uuid REFERENCES literature_packages(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_category text NOT NULL,
  outcome text NOT NULL,
  request_id text,
  correlation_id text,
  source_ip inet,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_literature_packages_tenant_status
  ON literature_packages (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_package
  ON evidence_artifacts (tenant_id, package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_time
  ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_request
  ON audit_events (request_id) WHERE request_id IS NOT NULL;
