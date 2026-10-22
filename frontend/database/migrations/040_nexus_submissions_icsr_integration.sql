-- Integrates the expanded ICSR preflight domain with scoped NEXUS submission packages.
CREATE TABLE IF NOT EXISTS nexus_submission_preflight_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  submission_package_id uuid NOT NULL,
  destination_profile text NOT NULL,
  engine_version text NOT NULL,
  readiness text NOT NULL CHECK (readiness IN ('BLOCKED','REVIEW_REQUIRED','READY_FOR_APPROVAL')),
  report jsonb NOT NULL,
  report_sha256 text NOT NULL CHECK (report_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_submission_preflight_scope FOREIGN KEY
    (tenant_id, workspace_id, environment, submission_package_id)
    REFERENCES nexus_submission_packages (tenant_id, workspace_id, environment, id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_submission_preflight_history
  ON nexus_submission_preflight_runs
  (tenant_id, workspace_id, environment, submission_package_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_submission_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  submission_package_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DELIVERED','FAILED','DEAD_LETTER')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT fk_submission_outbox_scope FOREIGN KEY
    (tenant_id, workspace_id, environment, submission_package_id)
    REFERENCES nexus_submission_packages (tenant_id, workspace_id, environment, id)
    ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, environment, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_submission_outbox_dispatch
  ON nexus_submission_outbox (status, available_at) WHERE status IN ('PENDING','FAILED');

COMMENT ON TABLE nexus_submission_preflight_runs IS
  'Immutable, tenant/workspace-scoped deterministic ICSR preflight evidence.';
COMMENT ON TABLE nexus_submission_outbox IS
  'At-least-once integration boundary. Live authority delivery remains feature-gated.';
