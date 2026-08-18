-- 016_report_definitions.sql
-- Saved, reusable report definitions. This is the architectural piece
-- that turns reporting from "rebuild the query every time" into
-- "build it once, name it, reuse it forever" -- the actual difference
-- between an ad-hoc export and an Argus/Veeva-grade reporting layer.
-- PV reporting needs genuinely change client to client and moment to
-- moment; the fix for that instability is not more report types, it's
-- a generic definition a user can shape themselves and keep.

CREATE TABLE IF NOT EXISTS report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  report_type text NOT NULL DEFAULT 'LINE_LISTING' CHECK (report_type IN ('LINE_LISTING')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_tenant
  ON report_definitions (tenant_id, updated_at DESC);

COMMENT ON TABLE report_definitions IS
  'A saved filter+field combination a user builds once and reuses. report_type is deliberately constrained to LINE_LISTING today -- aggregate/PBRER-style structured reports are a distinct, larger feature not built yet, not silently allowed here.';
