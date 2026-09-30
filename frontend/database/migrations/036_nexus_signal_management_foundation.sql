-- 036_nexus_signal_management_foundation.sql
-- Cleanup Sprint 8: governed Signal Management foundation.
-- Statistical detection engines remain separately validated capabilities.

CREATE TABLE IF NOT EXISTS nexus_signal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  signal_key text NOT NULL,
  product_key text NOT NULL,
  event_term text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'SPONTANEOUS_CASES','LITERATURE','CLINICAL','REGULATORY','AGGREGATE','OTHER'
  )),
  source_reference text,
  detection_method text NOT NULL,
  detection_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'DETECTED' CHECK (status IN (
    'DETECTED','VALIDATED','UNDER_EVALUATION','CONFIRMED','REFUTED','CLOSED'
  )),
  detected_at timestamptz NOT NULL,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_signal_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces (tenant_id, id)
    ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, environment, signal_key),
  UNIQUE (tenant_id, workspace_id, environment, id)
);

CREATE INDEX IF NOT EXISTS idx_signal_worklist
  ON nexus_signal_records
  (tenant_id, workspace_id, environment, status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS nexus_signal_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
  signal_id uuid NOT NULL,
  assessment_type text NOT NULL CHECK (assessment_type IN (
    'VALIDATION','PRIORITIZATION','EVALUATION','RECOMMENDATION','CLOSURE'
  )),
  outcome text NOT NULL,
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  assessment_version integer NOT NULL CHECK (assessment_version > 0),
  next_status text CHECK (next_status IN (
    'VALIDATED','UNDER_EVALUATION','CONFIRMED','REFUTED','CLOSED'
  )),
  assessed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_signal_assessment_scope
    FOREIGN KEY (tenant_id, workspace_id, environment, signal_id)
    REFERENCES nexus_signal_records (tenant_id, workspace_id, environment, id)
    ON DELETE RESTRICT,
  UNIQUE (signal_id, assessment_version)
);

CREATE INDEX IF NOT EXISTS idx_signal_assessments_signal
  ON nexus_signal_assessments (signal_id, assessment_version DESC);
