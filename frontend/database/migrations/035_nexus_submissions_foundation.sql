-- 035_nexus_submissions_foundation.sql
-- Cleanup Sprint 7: canonical Submissions foundation.
-- External regulator transports are adapter-controlled and disabled unless explicitly configured.

CREATE TABLE IF NOT EXISTS nexus_submission_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  submission_key text NOT NULL,
  idempotency_key text NOT NULL,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE RESTRICT,
  case_version_id uuid NOT NULL REFERENCES safety_case_versions(id) ON DELETE RESTRICT,
  destination_type text NOT NULL CHECK (destination_type IN (
    'REGULATORY_AUTHORITY','PARTNER','SANDBOX'
  )),
  destination_key text NOT NULL,
  message_profile text NOT NULL DEFAULT 'ICH_E2B_R3',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','READY','TRANSMITTING','TRANSMITTED',
    'ACKNOWLEDGED','REJECTED','FAILED','CANCELLED'
  )),
  package_payload jsonb NOT NULL,
  package_sha256 text NOT NULL CHECK (package_sha256 ~ '^[a-f0-9]{64}$'),
  source_case_sha256 text NOT NULL CHECK (source_case_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_submission_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, environment, submission_key),
  UNIQUE (tenant_id, workspace_id, environment, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_submission_packages_worklist
  ON nexus_submission_packages
  (tenant_id, workspace_id, environment, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_packages_case
  ON nexus_submission_packages
  (tenant_id, workspace_id, environment, case_id, case_version_id);

CREATE TABLE IF NOT EXISTS nexus_submission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  submission_package_id uuid NOT NULL
    REFERENCES nexus_submission_packages(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  transport_adapter_key text NOT NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('STARTED','SUCCEEDED','FAILED')),
  external_message_id text,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_submission_attempt_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE RESTRICT,
  UNIQUE (submission_package_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_submission_attempts_package
  ON nexus_submission_attempts (submission_package_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS nexus_submission_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  submission_package_id uuid NOT NULL
    REFERENCES nexus_submission_packages(id) ON DELETE RESTRICT,
  external_ack_id text NOT NULL,
  ack_type text NOT NULL,
  ack_status text NOT NULL CHECK (ack_status IN (
    'ACCEPTED','PARTIAL','REJECTED','TECHNICAL_ERROR','PENDING'
  )),
  ack_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ack_sha256 text NOT NULL CHECK (ack_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL,
  recorded_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_submission_ack_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, environment, external_ack_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_ack_package
  ON nexus_submission_acknowledgements
  (submission_package_id, received_at DESC);
