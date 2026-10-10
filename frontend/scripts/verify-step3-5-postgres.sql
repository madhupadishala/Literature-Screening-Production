\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE nexus_client_workspaces (id text,tenant_id text);
CREATE TEMP TABLE literature_packages (id text,tenant_id text,workspace_id text,environment text);
CREATE TEMP TABLE literature_review_workspaces (id text,tenant_id text,package_id text,status text);
CREATE TEMP TABLE audit_events (tenant_id text,workspace_id text,actor_id text,event_type text,outcome text,details jsonb);
INSERT INTO nexus_client_workspaces VALUES ('client-a','tenant-1'),('client-b','tenant-1');
INSERT INTO literature_packages VALUES ('package-a','tenant-1','client-a','UAT'),('package-b','tenant-1','client-b','UAT'),('package-c','tenant-2','client-a','UAT');
INSERT INTO literature_review_workspaces VALUES ('review-a','tenant-1','package-a','IN_REVIEW'),('review-b','tenant-1','package-b','IN_REVIEW'),('review-c','tenant-2','package-c','IN_REVIEW');
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM literature_review_workspaces review
 JOIN literature_packages package ON package.id=review.package_id AND package.tenant_id=review.tenant_id
 WHERE review.tenant_id='tenant-1' AND package.workspace_id='client-a' AND package.environment='UAT';
 IF n<>1 THEN RAISE EXCEPTION 'client scoped list expected 1 got %',n; END IF;
 UPDATE literature_review_workspaces review SET status='REVIEW_COMPLETE'
 FROM literature_packages package
 WHERE review.package_id=package.id AND review.tenant_id=package.tenant_id
 AND review.id='review-b' AND review.tenant_id='tenant-1'
 AND package.workspace_id='client-a' AND package.environment='UAT';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'cross-client mutation succeeded'; END IF;
 UPDATE literature_review_workspaces review SET status='REVIEW_COMPLETE'
 FROM literature_packages package
 WHERE review.package_id=package.id AND review.tenant_id=package.tenant_id
 AND review.id='review-c' AND review.tenant_id='tenant-1'
 AND package.workspace_id='client-a' AND package.environment='UAT';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'cross-tenant mutation succeeded'; END IF;
 INSERT INTO audit_events VALUES ('tenant-1','client-a','actor-1','WORKSPACE_AUTHORIZATION_DENIED','denied','{"permission":"MEDICAL_REVIEW","reason":"WORKSPACE_CONTEXT_INVALID"}');
 SELECT count(*) INTO n FROM audit_events WHERE tenant_id='tenant-1' AND workspace_id='client-a' AND actor_id='actor-1' AND event_type='WORKSPACE_AUTHORIZATION_DENIED' AND outcome='denied' AND details->>'reason'='WORKSPACE_CONTEXT_INVALID';
 IF n<>1 THEN RAISE EXCEPTION 'audit record not persisted'; END IF;
 IF EXISTS (SELECT 1 FROM audit_events WHERE details ? 'token' OR details ? 'password') THEN RAISE EXCEPTION 'sensitive audit field persisted'; END IF;
END $$;
ROLLBACK;
