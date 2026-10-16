-- Run under database migration owner, not the runtime INSERT-only role.
CREATE TABLE IF NOT EXISTS public.pv_agent_rejection_audit (
  event_id uuid PRIMARY KEY,
  agent_id text NOT NULL CHECK (agent_id ~ '^AG(0[1-9]|1[0-9]|2[0-7])$'),
  tenant_id text NOT NULL,
  client_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type = 'specialist_execution_rejected'),
  error_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pv_agent_rejection_audit_tenant_time_idx
  ON public.pv_agent_rejection_audit (tenant_id, client_id, occurred_at DESC);
ALTER TABLE public.pv_agent_rejection_audit ENABLE ROW LEVEL SECURITY;
-- Runtime role may only insert through dedicated scoped administration;
-- do not grant SELECT, UPDATE or DELETE to general application roles.
