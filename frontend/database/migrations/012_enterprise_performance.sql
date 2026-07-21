CREATE INDEX IF NOT EXISTS idx_workflow_state_tenant_state_updated
  ON literature_workflow_state (tenant_id, workflow_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_adhoc_results_tenant_package
  ON ad_hoc_literature_results (tenant_id, evidence_package_id)
  WHERE evidence_package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adhoc_searches_tenant_status_time
  ON ad_hoc_literature_searches (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_executions_tenant_type_time
  ON ai_executions (tenant_id, execution_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_executions_tenant_failures
  ON ai_executions (tenant_id, created_at DESC)
  WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pool_total integer NOT NULL CHECK (pool_total >= 0),
  pool_idle integer NOT NULL CHECK (pool_idle >= 0),
  pool_waiting integer NOT NULL CHECK (pool_waiting >= 0),
  ai_p95_ms numeric(12,2) CHECK (ai_p95_ms IS NULL OR ai_p95_ms >= 0),
  search_p95_ms numeric(12,2) CHECK (search_p95_ms IS NULL OR search_p95_ms >= 0),
  snapshot_payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots_tenant_time
  ON performance_snapshots (tenant_id, captured_at DESC);
