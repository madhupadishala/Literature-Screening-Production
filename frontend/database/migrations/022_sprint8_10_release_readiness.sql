-- Sprint 8-10: multi-patient Intake lineage, durable reliability findings,
-- and system validation package governance.

CREATE TABLE IF NOT EXISTS literature_intake_case_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_export_id uuid NOT NULL REFERENCES intake_input_exports(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  patient_segment_key text NOT NULL,
  case_candidate_key text NOT NULL,
  patient_payload jsonb NOT NULL,
  assessment_payload jsonb NOT NULL,
  source_lineage_sha256 text NOT NULL,
  content_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT literature_intake_case_candidate_segment_chk
    CHECK (length(btrim(patient_segment_key)) > 0),
  CONSTRAINT literature_intake_case_candidate_key_chk
    CHECK (length(btrim(case_candidate_key)) > 0),
  UNIQUE (tenant_id, intake_export_id, patient_segment_key)
);

CREATE INDEX IF NOT EXISTS idx_intake_case_candidates_package
  ON literature_intake_case_candidates (tenant_id, package_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_case_candidates_lineage
  ON literature_intake_case_candidates (tenant_id, source_lineage_sha256);

CREATE TABLE IF NOT EXISTS reliability_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  finding_key text NOT NULL,
  finding_type text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  package_id uuid REFERENCES literature_packages(id) ON DELETE CASCADE,
  scheduled_run_id uuid REFERENCES literature_scheduled_search_runs(id) ON DELETE CASCADE,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  observed_count integer NOT NULL DEFAULT 1 CHECK (observed_count > 0),
  acknowledged_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT reliability_findings_type_chk
    CHECK (finding_type IN (
      'STUCK_WORKFLOW',
      'STALE_SCHEDULED_RUN',
      'SCHEDULER_ALERT',
      'INTAKE_INTEGRITY',
      'AI_FAILURE_RATE',
      'CONFIGURATION_GAP'
    )),
  CONSTRAINT reliability_findings_severity_chk
    CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  CONSTRAINT reliability_findings_status_chk
    CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  UNIQUE (tenant_id, finding_key)
);

CREATE INDEX IF NOT EXISTS idx_reliability_findings_open
  ON reliability_findings (tenant_id, severity, last_seen_at DESC)
  WHERE status <> 'RESOLVED';

CREATE INDEX IF NOT EXISTS idx_reliability_findings_package
  ON reliability_findings (tenant_id, package_id, last_seen_at DESC)
  WHERE package_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS system_validation_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  validation_key text NOT NULL,
  package_version integer NOT NULL DEFAULT 1 CHECK (package_version > 0),
  scope text NOT NULL DEFAULT 'LITERATURE_SCREENING_PRODUCTION',
  build_sha text NOT NULL,
  release_version text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  payload jsonb NOT NULL,
  content_sha256 text NOT NULL,
  generated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_validation_packages_scope_chk
    CHECK (scope IN ('LITERATURE_SCREENING_PRODUCTION')),
  CONSTRAINT system_validation_packages_status_chk
    CHECK (status IN ('DRAFT','BLOCKED','READY_FOR_QA_REVIEW','APPROVED','REJECTED')),
  UNIQUE (tenant_id, validation_key)
);

CREATE INDEX IF NOT EXISTS idx_system_validation_packages_build
  ON system_validation_packages (tenant_id, build_sha, generated_at DESC);

CREATE TABLE IF NOT EXISTS system_validation_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  validation_package_id uuid NOT NULL REFERENCES system_validation_packages(id) ON DELETE CASCADE,
  signoff_role text NOT NULL,
  decision text NOT NULL,
  comments text NOT NULL,
  signed_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  signed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_validation_signoffs_role_chk
    CHECK (signoff_role IN ('VALIDATION_OWNER','QUALITY_APPROVER','RELEASE_APPROVER')),
  CONSTRAINT system_validation_signoffs_decision_chk
    CHECK (decision IN ('APPROVED','REJECTED')),
  UNIQUE (tenant_id, validation_package_id, signoff_role)
);

CREATE INDEX IF NOT EXISTS idx_system_validation_signoffs_package
  ON system_validation_signoffs (tenant_id, validation_package_id, signed_at DESC);
