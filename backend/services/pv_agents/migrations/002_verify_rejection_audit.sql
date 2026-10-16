\set ON_ERROR_STOP on
DO $$
DECLARE cols text; role_name text; has_force bool;
BEGIN
 IF to_regclass('public.pv_agent_rejection_audit') IS NULL THEN RAISE EXCEPTION 'Audit table absent'; END IF;
 SELECT relforcerowsecurity INTO has_force FROM pg_class WHERE oid='public.pv_agent_rejection_audit'::regclass;
 IF NOT has_force THEN RAISE EXCEPTION 'FORCE RLS missing'; END IF;
 SELECT string_agg(column_name,',') INTO cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pv_agent_rejection_audit'
    AND column_name ~* '(narrative|payload|raw|text|patient|reporter|pii|source|document|prompt|token)';
 IF cols IS NOT NULL THEN RAISE EXCEPTION 'Potential PII columns: %',cols; END IF;
 IF has_table_privilege('PUBLIC','public.pv_agent_rejection_audit','SELECT')
    OR has_table_privilege('PUBLIC','public.pv_agent_rejection_audit','INSERT')
    OR has_table_privilege('PUBLIC','public.pv_agent_rejection_audit','UPDATE')
    OR has_table_privilege('PUBLIC','public.pv_agent_rejection_audit','DELETE')
 THEN RAISE EXCEPTION 'PUBLIC privileges present'; END IF;
 FOR role_name IN SELECT rolname FROM pg_roles
   WHERE rolname IN ('anon','authenticated','web_anon','nexus_runtime','nexus_audit_writer') LOOP
   IF has_table_privilege(role_name,'public.pv_agent_rejection_audit','UPDATE')
      OR has_table_privilege(role_name,'public.pv_agent_rejection_audit','DELETE')
   THEN RAISE EXCEPTION 'Mutation privilege held by %',role_name; END IF;
   IF role_name IN ('anon','authenticated','web_anon') AND
      (has_table_privilege(role_name,'public.pv_agent_rejection_audit','SELECT')
       OR has_table_privilege(role_name,'public.pv_agent_rejection_audit','INSERT'))
   THEN RAISE EXCEPTION 'Anonymous/user access held by %',role_name; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='pv_agent_rejection_audit'
   AND policyname='pv_agent_rejection_insert_only'
   AND cmd='INSERT' AND with_check LIKE '%nexus.audit_tenant%'
   AND with_check LIKE '%nexus.audit_client%')
 THEN RAISE EXCEPTION 'Scoped insert RLS missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename='pv_agent_rejection_audit' AND cmd IN ('UPDATE','DELETE','ALL'))
 THEN RAISE EXCEPTION 'Update/delete/ALL RLS policy exists'; END IF;
END $$;
SELECT 'PASS audit schema,RLS,privilege gate' AS verification;
