CREATE TABLE IF NOT EXISTS monitoring_metrics (
  id bigserial PRIMARY KEY,
  metric_name text NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram')),
  metric_value double precision NOT NULL,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  outcome text NOT NULL,
  request_id text,
  source_ip inet,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version text NOT NULL,
  build_sha text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'validated', 'approved', 'released', 'rejected')),
  manifest jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by text,
  approved_at timestamptz,
  UNIQUE (release_version, build_sha)
);

CREATE TABLE IF NOT EXISTS release_gate_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_candidate_id uuid REFERENCES release_candidates(id) ON DELETE CASCADE,
  gate_id text NOT NULL,
  gate_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'waived')),
  mandatory boolean NOT NULL DEFAULT true,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_configuration (
  config_key text PRIMARY KEY,
  config_value jsonb NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  scope_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope_key, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_monitoring_metrics_name_time
  ON monitoring_metrics (metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_time
  ON security_events (severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_gate_evidence_candidate
  ON release_gate_evidence (release_candidate_id, gate_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_expiry
  ON rate_limit_counters (expires_at);
