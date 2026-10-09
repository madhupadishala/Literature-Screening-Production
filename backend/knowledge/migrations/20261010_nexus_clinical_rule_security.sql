-- Task 2.2 isolation and controlled approval for dedicated validation database.
-- Roles are NOLOGIN until a trusted deployment explicitly provisions scoped credentials.
CREATE TABLE IF NOT EXISTS nexus_clinical_rule_principals (
  role_name name PRIMARY KEY, tenant_id text NOT NULL, client_id text,
  allowed_agent text, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS nexus_clinical_rule_approval_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id text NOT NULL, version integer NOT NULL, action text NOT NULL,
  actor name NOT NULL DEFAULT session_user,
  reason text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
DO $block$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexus_clinical_rule_reader') THEN
    CREATE ROLE nexus_clinical_rule_reader NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexus_clinical_rule_approver') THEN
    CREATE ROLE nexus_clinical_rule_approver NOLOGIN NOBYPASSRLS;
  END IF;
END $block$;
REVOKE ALL ON nexus_clinical_rule_revisions FROM PUBLIC;
REVOKE ALL ON nexus_clinical_rule_principals FROM PUBLIC;
REVOKE ALL ON nexus_clinical_rule_approval_audit FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nexus_clinical_rule_reader, nexus_clinical_rule_approver;
GRANT SELECT ON nexus_clinical_rule_revisions TO nexus_clinical_rule_reader;
ALTER TABLE nexus_clinical_rule_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_clinical_rule_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinical_rules_authorized_reader ON nexus_clinical_rule_revisions;
CREATE POLICY clinical_rules_authorized_reader ON nexus_clinical_rule_revisions
 FOR SELECT TO nexus_clinical_rule_reader
 USING (
   approval_status='APPROVED'
   AND EXISTS (
    SELECT 1 FROM nexus_clinical_rule_principals principal
    WHERE principal.role_name = current_user AND principal.enabled
      AND (principal.allowed_agent IS NULL OR principal.allowed_agent=owner_agent)
      AND (policy_scope IN ('GLOBAL','NEXUS')
        OR (policy_scope='TENANT' AND principal.tenant_id=tenant_id)
        OR (policy_scope='CLIENT' AND principal.tenant_id=tenant_id AND principal.client_id=client_id))
   )
 );
GRANT SELECT ON nexus_clinical_rule_principals TO nexus_clinical_rule_reader;
CREATE OR REPLACE FUNCTION nexus_approve_clinical_rule(
  p_rule_id text,p_version integer,p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT pg_has_role(session_user,'nexus_clinical_rule_approver','member') THEN
   RAISE EXCEPTION 'Approval requires authorized approver role';
 END IF;
 IF length(trim(coalesce(p_reason,''))) < 12 THEN
   RAISE EXCEPTION 'Approval rationale required';
 END IF;
 IF EXISTS (SELECT 1 FROM public.nexus_clinical_rule_revisions
            WHERE rule_id=p_rule_id AND version=p_version AND
            (decision_table->>'on_no_match'='MANUAL_REVIEW'
             AND decision_table::text LIKE '%never_activate_placeholder%')) THEN
   RAISE EXCEPTION 'Placeholder decision tables cannot be approved';
 END IF;
 UPDATE public.nexus_clinical_rule_revisions SET approval_status='APPROVED'
 WHERE rule_id=p_rule_id AND version=p_version AND approval_status='DRAFT';
 IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found or no longer draft'; END IF;
 INSERT INTO public.nexus_clinical_rule_approval_audit(rule_id,version,action,reason)
 VALUES(p_rule_id,p_version,'APPROVED',p_reason);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION nexus_approve_clinical_rule(text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus_approve_clinical_rule(text,integer,text) TO nexus_clinical_rule_approver;
