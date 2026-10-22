\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pv_agent_rejection_audit LIMIT 1) THEN
  RAISE EXCEPTION 'Refuse rollback: durable audit records exist; use forward correction';
 END IF;
END $$;
DROP TABLE public.pv_agent_rejection_audit;
COMMIT;
