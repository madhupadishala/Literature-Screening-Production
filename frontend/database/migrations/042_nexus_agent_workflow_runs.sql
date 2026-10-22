-- Review-pending agent results: never an approved case version or authority transmission.
CREATE TABLE IF NOT EXISTS nexus_agent_workflow_runs (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  workspace_id uuid NOT NULL REFERENCES nexus_client_workspaces(id),
  environment text NOT NULL CHECK(environment IN ('PROD','UAT','TRAINING')),
  request_id text NOT NULL,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id),
  case_id uuid NOT NULL REFERENCES safety_cases(id),
  source_sha256 text NOT NULL CHECK(length(source_sha256)=64),
  result jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES application_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,workspace_id,environment,request_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_workflow_case_scope ON nexus_agent_workflow_runs(tenant_id,workspace_id,environment,case_id);
-- Defense in depth: every writer must use a source and case owned by the same scope.
CREATE OR REPLACE FUNCTION nexus_agent_workflow_assert_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM safety_intake_records i WHERE i.id=NEW.intake_record_id AND i.tenant_id=NEW.tenant_id AND i.workspace_id=NEW.workspace_id AND i.environment=NEW.environment)
     OR NOT EXISTS(SELECT 1 FROM safety_cases c WHERE c.id=NEW.case_id AND c.intake_record_id=NEW.intake_record_id AND c.tenant_id=NEW.tenant_id AND c.workspace_id=NEW.workspace_id AND c.environment=NEW.environment)
  THEN RAISE EXCEPTION 'Agent workflow source/case scope mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_agent_workflow_scope BEFORE INSERT OR UPDATE ON nexus_agent_workflow_runs FOR EACH ROW EXECUTE FUNCTION nexus_agent_workflow_assert_scope();
-- Authorized, normalized read projection for AG19; missing comparison features
-- remain unknown, never fabricated from absent structured data.
CREATE OR REPLACE VIEW nexus_agent_duplicate_candidates AS
SELECT t.tenant_key,c.workspace_id,c.environment,'icsr'::text AS kind,
       c.id::text AS record_id,
       jsonb_build_object('case_id',c.id::text,'narrative',COALESCE(d.extracted_text,'')) AS record
FROM safety_cases c JOIN tenants t ON t.id=c.tenant_id
LEFT JOIN LATERAL (
  SELECT x.extracted_text FROM safety_source_documents x
  WHERE x.tenant_id=c.tenant_id AND x.intake_record_id=c.intake_record_id
  ORDER BY x.created_at DESC LIMIT 1
) d ON true;
