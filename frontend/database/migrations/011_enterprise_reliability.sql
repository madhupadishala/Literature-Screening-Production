CREATE TABLE IF NOT EXISTS reliability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  overall_status text NOT NULL CHECK (overall_status IN ('healthy', 'degraded', 'unhealthy')),
  critical_failures integer NOT NULL DEFAULT 0 CHECK (critical_failures >= 0),
  degraded_checks integer NOT NULL DEFAULT 0 CHECK (degraded_checks >= 0),
  snapshot_payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reliability_snapshots_tenant_time
  ON reliability_snapshots (tenant_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_reliability_snapshots_tenant_status
  ON reliability_snapshots (tenant_id, overall_status, captured_at DESC);
