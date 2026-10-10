-- Standalone PostgreSQL contract test: real SQL predicate and atomic single-claim semantics.
-- The production tables are not accessed.
BEGIN;
CREATE TEMP TABLE literature_packages (id text PRIMARY KEY, tenant_id text, package_key text, status text, article_identity jsonb, external_reference text);
CREATE TEMP TABLE literature_workflow_state (package_id text, tenant_id text, workflow_state text, state_version int DEFAULT 1, state_payload jsonb DEFAULT '{}'::jsonb, updated_by text, updated_at timestamptz);
CREATE TEMP TABLE hits_results (tenant_id text, package_id text, result_version int, created_at timestamptz DEFAULT now(), result_payload jsonb);
INSERT INTO literature_packages VALUES ('p1','t1','p1','HITS_REVIEW','{"title":"Article"}',NULL),('p2','t2','p2','HITS_REVIEW','{}',NULL);
INSERT INTO literature_workflow_state(package_id,tenant_id,workflow_state) VALUES ('p1','t1','HITS_REVIEW'),('p2','t2','HITS_REVIEW');
INSERT INTO hits_results(tenant_id,package_id,result_version,result_payload) VALUES ('t1','p1',1,'{"status":"HITS_EXECUTION_FAILED"}'),('t2','p2',1,'{"status":"HITS_EXECUTION_FAILED"}');
DO $$
DECLARE first_count int; second_count int; cross_count int;
BEGIN
  WITH claim AS (
    UPDATE literature_workflow_state workflow
    SET workflow_state = 'HITS_RUNNING', state_version = state_version+1,
      state_payload=COALESCE(workflow.state_payload,'{}'::jsonb)||jsonb_build_object('hitsRetryClaimedAt',now()),
      updated_by='u1',updated_at=now()
    FROM literature_packages package
    WHERE workflow.package_id=package.id AND workflow.tenant_id=package.tenant_id
      AND package.id='p1' AND package.tenant_id='t1'
      AND workflow.workflow_state='HITS_REVIEW'
      AND EXISTS (SELECT 1 FROM LATERAL (
        SELECT result_payload FROM hits_results latest
        WHERE latest.tenant_id=package.tenant_id AND latest.package_id=package.id
        ORDER BY result_version DESC,created_at DESC LIMIT 1
      ) latest_result WHERE latest_result.result_payload->>'status'='HITS_EXECUTION_FAILED')
    RETURNING package.id
  ) SELECT count(*) INTO first_count FROM claim;
  IF first_count <> 1 THEN RAISE EXCEPTION 'First claim returned % not 1',first_count; END IF;
  WITH claim AS (
    UPDATE literature_workflow_state workflow SET workflow_state='HITS_RUNNING'
    FROM literature_packages package WHERE workflow.package_id=package.id
      AND workflow.tenant_id=package.tenant_id AND package.id='p1'
      AND package.tenant_id='t1' AND workflow.workflow_state='HITS_REVIEW'
    RETURNING package.id
  ) SELECT count(*) INTO second_count FROM claim;
  IF second_count <> 0 THEN RAISE EXCEPTION 'Repeated claim improperly succeeded'; END IF;
  WITH claim AS (
    UPDATE literature_workflow_state workflow SET workflow_state='HITS_RUNNING'
    FROM literature_packages package WHERE workflow.package_id=package.id
      AND workflow.tenant_id=package.tenant_id AND package.id='p2'
      AND package.tenant_id='t1' AND workflow.workflow_state='HITS_REVIEW'
    RETURNING package.id
  ) SELECT count(*) INTO cross_count FROM claim;
  IF cross_count <> 0 THEN RAISE EXCEPTION 'Cross-tenant claim succeeded'; END IF;
END $$;
ROLLBACK;
