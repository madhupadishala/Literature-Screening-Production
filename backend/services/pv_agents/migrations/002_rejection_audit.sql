-- Controlled migration; execute only with migration-owner credentials.
BEGIN;
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
  ON public.pv_agent_rejection_audit(tenant_id,client_id,occurred_at DESC);
ALTER TABLE public.pv_agent_rejection_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pv_agent_rejection_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pv_agent_rejection_audit FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.pv_agent_rejection_audit FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.pv_agent_rejection_audit FROM authenticated;
  END IF;
END $$;
DROP POLICY IF EXISTS pv_agent_rejection_insert_only ON public.pv_agent_rejection_audit;
DROP POLICY IF EXISTS pv_agent_rejection_tenant_read ON public.pv_agent_rejection_audit;
CREATE POLICY pv_agent_rejection_insert_only ON public.pv_agent_rejection_audit
  FOR INSERT TO PUBLIC
  WITH CHECK (
    nullif(current_setting('nexus.audit_tenant',true),'')=tenant_id
    AND nullif(current_setting('nexus.audit_client',true),'')=client_id
  );
-- A non-login auditor permission group; DBA grants it only to the separate
-- staging QA auditor login. Fixed synthetic scope cannot inspect real tenants.
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nexus_synthetic_audit_reader')
  THEN EXECUTE 'CREATE ROLE nexus_synthetic_audit_reader NOLOGIN'; END IF;
END $;
GRANT SELECT ON public.pv_agent_rejection_audit TO nexus_synthetic_audit_reader;
CREATE POLICY pv_agent_synthetic_auditor_read ON public.pv_agent_rejection_audit
  FOR SELECT TO nexus_synthetic_audit_reader
  USING (tenant_id='nexus-staging-tenant' AND client_id='nexus-staging-client');
-- Access remains DENIED by table privileges until the deployment operator
-- explicitly GRANTs INSERT to a dedicated NOLOGIN-independent audit writer.
-- Never grant UPDATE/DELETE; table owner/superuser bypass requires DB governance.
COMMIT;
