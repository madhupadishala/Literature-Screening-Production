-- Nexus Sprint 2: Common Safety Data Backbone
-- Shared regulated entities used by Intake, Case Processing, Medical Review,
-- future Signal and Aggregate modules. Literature remains an upstream source.

CREATE TABLE IF NOT EXISTS safety_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'LITERATURE', 'SPONTANEOUS', 'SOLICITED', 'CLINICAL_TRIAL',
    'REGISTRY', 'PARTNER', 'REGULATORY_AUTHORITY', 'DIGITAL', 'OTHER'
  )),
  source_system text NOT NULL,
  external_reference text,
  received_at timestamptz NOT NULL,
  country_code text,
  language_code text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'NORMALIZED', 'REJECTED', 'ARCHIVED')),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_sources_country_code_chk
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT safety_sources_language_code_chk
    CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  UNIQUE (tenant_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_sources_tenant_type_time
  ON safety_sources (tenant_id, source_type, received_at DESC);

CREATE TABLE IF NOT EXISTS safety_intake_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_key text NOT NULL,
  source_id uuid NOT NULL REFERENCES safety_sources(id) ON DELETE RESTRICT,
  source_record_key text NOT NULL,
  intake_channel text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED', 'IN_TRIAGE', 'VALIDITY_REVIEW', 'DUPLICATE_REVIEW',
    'READY_FOR_CASE', 'CASE_CREATED', 'NO_CASE', 'REJECTED'
  )),
  priority text NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  validity_status text NOT NULL DEFAULT 'UNASSESSED'
    CHECK (validity_status IN ('UNASSESSED', 'VALID', 'INVALID', 'UNRESOLVED')),
  duplicate_status text NOT NULL DEFAULT 'UNASSESSED'
    CHECK (duplicate_status IN ('UNASSESSED', 'UNIQUE', 'POTENTIAL_DUPLICATE', 'CONFIRMED_DUPLICATE')),
  seriousness_status text NOT NULL DEFAULT 'UNASSESSED'
    CHECK (seriousness_status IN ('UNASSESSED', 'SERIOUS', 'NON_SERIOUS', 'UNRESOLVED')),
  initial_receipt_date date,
  latest_receipt_date date,
  country_code text,
  language_code text,
  intake_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_lineage_sha256 text NOT NULL CHECK (source_lineage_sha256 ~ '^[a-f0-9]{64}$'),
  assigned_to uuid REFERENCES application_users(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_intake_receipt_dates_chk
    CHECK (latest_receipt_date IS NULL OR initial_receipt_date IS NULL OR latest_receipt_date >= initial_receipt_date),
  CONSTRAINT safety_intake_country_code_chk
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT safety_intake_language_code_chk
    CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  UNIQUE (tenant_id, intake_key),
  UNIQUE (tenant_id, source_id, source_record_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_intake_tenant_status_time
  ON safety_intake_records (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS safety_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  patient_key text NOT NULL,
  patient_reference text,
  sex text CHECK (sex IS NULL OR sex IN ('MALE', 'FEMALE', 'UNKNOWN', 'NOT_SPECIFIED')),
  age_value numeric,
  age_unit text,
  age_group text,
  date_of_birth date,
  death_date date,
  weight_kg numeric,
  height_cm numeric,
  pregnancy_status text,
  medical_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_information jsonb NOT NULL DEFAULT '{}'::jsonb,
  e2b_d_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_patient_age_chk CHECK (age_value IS NULL OR age_value >= 0),
  CONSTRAINT safety_patient_weight_chk CHECK (weight_kg IS NULL OR weight_kg >= 0),
  CONSTRAINT safety_patient_height_chk CHECK (height_cm IS NULL OR height_cm >= 0),
  UNIQUE (tenant_id, intake_record_id, patient_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_patients_intake
  ON safety_patients (tenant_id, intake_record_id);

CREATE TABLE IF NOT EXISTS safety_reporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  reporter_key text NOT NULL,
  primary_source boolean NOT NULL DEFAULT false,
  qualification text,
  organization text,
  country_code text,
  reporter_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  e2b_c2_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_reporters_country_code_chk
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  UNIQUE (tenant_id, intake_record_id, reporter_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_reporters_intake
  ON safety_reporters (tenant_id, intake_record_id, primary_source DESC);

CREATE TABLE IF NOT EXISTS safety_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  reported_name text NOT NULL,
  role_characterization text NOT NULL DEFAULT 'UNSPECIFIED' CHECK (role_characterization IN (
    'SUSPECT', 'INTERACTING', 'CONCOMITANT', 'DRUG_NOT_ADMINISTERED', 'UNSPECIFIED'
  )),
  active_substances jsonb NOT NULL DEFAULT '[]'::jsonb,
  authorization jsonb NOT NULL DEFAULT '{}'::jsonb,
  indication jsonb NOT NULL DEFAULT '{}'::jsonb,
  dosage jsonb NOT NULL DEFAULT '[]'::jsonb,
  route jsonb NOT NULL DEFAULT '{}'::jsonb,
  therapy_dates jsonb NOT NULL DEFAULT '{}'::jsonb,
  batch_lot_number text,
  action_taken text,
  rechallenge jsonb NOT NULL DEFAULT '{}'::jsonb,
  e2b_g_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intake_record_id, product_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_products_intake_role
  ON safety_products (tenant_id, intake_record_id, role_characterization);

CREATE TABLE IF NOT EXISTS safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  reported_term text NOT NULL,
  meddra_term text,
  meddra_code text,
  meddra_version text,
  onset_date timestamptz,
  end_date timestamptz,
  outcome text,
  seriousness boolean,
  seriousness_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  medically_confirmed boolean,
  country_code text,
  e2b_e_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_events_date_chk CHECK (end_date IS NULL OR onset_date IS NULL OR end_date >= onset_date),
  CONSTRAINT safety_events_country_code_chk
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  UNIQUE (tenant_id, intake_record_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_events_intake
  ON safety_events (tenant_id, intake_record_id, seriousness DESC);

CREATE TABLE IF NOT EXISTS safety_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  test_key text NOT NULL,
  test_name text NOT NULL,
  test_date timestamptz,
  result_value text,
  result_unit text,
  reference_range text,
  comments text,
  e2b_f_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intake_record_id, test_key)
);

CREATE TABLE IF NOT EXISTS safety_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_key text NOT NULL,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE RESTRICT,
  case_status text NOT NULL DEFAULT 'OPEN'
    CHECK (case_status IN ('OPEN', 'IN_PROCESS', 'QC_REVIEW', 'MEDICAL_REVIEW', 'FINALIZED', 'SUBMITTED', 'CLOSED', 'VOID')),
  report_type text,
  study_type text,
  country_code text,
  initial_receipt_date date NOT NULL,
  latest_receipt_date date NOT NULL,
  seriousness_status text NOT NULL DEFAULT 'UNRESOLVED'
    CHECK (seriousness_status IN ('SERIOUS', 'NON_SERIOUS', 'UNRESOLVED')),
  expedited_reporting_required boolean,
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  locked_at timestamptz,
  locked_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_case_receipt_dates_chk CHECK (latest_receipt_date >= initial_receipt_date),
  CONSTRAINT safety_case_country_code_chk
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  UNIQUE (tenant_id, case_key),
  UNIQUE (tenant_id, intake_record_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_cases_tenant_status_time
  ON safety_cases (tenant_id, case_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS safety_case_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  version_type text NOT NULL CHECK (version_type IN ('INITIAL', 'FOLLOW_UP', 'CORRECTION', 'NULLIFICATION')),
  e2b_profile text NOT NULL DEFAULT 'ICH_E2B_R3',
  schema_version text NOT NULL,
  case_payload jsonb NOT NULL,
  case_sha256 text NOT NULL CHECK (case_sha256 ~ '^[a-f0-9]{64}$'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) >= 10),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_id, version)
);

CREATE INDEX IF NOT EXISTS idx_safety_case_versions_case
  ON safety_case_versions (tenant_id, case_id, version DESC);

CREATE TABLE IF NOT EXISTS safety_product_event_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  case_id uuid REFERENCES safety_cases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES safety_products(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES safety_events(id) ON DELETE CASCADE,
  assessment_type text NOT NULL CHECK (assessment_type IN ('CAUSALITY', 'EXPECTEDNESS')),
  method_key text,
  result text NOT NULL,
  rationale text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_product_event_assessments_case
  ON safety_product_event_assessments (tenant_id, case_id, product_id, event_id);

CREATE TABLE IF NOT EXISTS safety_review_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('INTAKE_RECORD', 'CASE', 'CASE_VERSION')),
  entity_id uuid NOT NULL,
  task_type text NOT NULL CHECK (task_type IN (
    'TRIAGE', 'VALIDITY', 'DUPLICATE_REVIEW', 'CASE_PROCESSING',
    'QC', 'MEDICAL_REVIEW', 'FINALIZATION', 'SUBMISSION_REVIEW'
  )),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  assigned_to uuid REFERENCES application_users(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_safety_review_tasks_worklist
  ON safety_review_tasks (tenant_id, status, task_type, due_at);

CREATE TABLE IF NOT EXISTS safety_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id uuid REFERENCES safety_sources(id) ON DELETE CASCADE,
  intake_record_id uuid REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  case_id uuid REFERENCES safety_cases(id) ON DELETE CASCADE,
  case_version_id uuid REFERENCES safety_case_versions(id) ON DELETE CASCADE,
  review_task_id uuid REFERENCES safety_review_tasks(id) ON DELETE CASCADE,
  evidence_artifact_id uuid REFERENCES evidence_artifacts(id) ON DELETE SET NULL,
  link_type text NOT NULL,
  source_locator jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_evidence_target_chk CHECK (
    source_id IS NOT NULL OR intake_record_id IS NOT NULL OR case_id IS NOT NULL
    OR case_version_id IS NOT NULL OR review_task_id IS NOT NULL
  ),
  CONSTRAINT safety_evidence_sha256_chk
    CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_safety_evidence_intake
  ON safety_evidence_links (tenant_id, intake_record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_evidence_case
  ON safety_evidence_links (tenant_id, case_id, created_at DESC);

-- Bind the governed Literature handoff to the common safety intake without
-- changing the original immutable Literature export.
ALTER TABLE intake_input_exports
  ADD COLUMN IF NOT EXISTS safety_intake_record_id uuid
    REFERENCES safety_intake_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intake_input_exports_safety_intake
  ON intake_input_exports (tenant_id, safety_intake_record_id)
  WHERE safety_intake_record_id IS NOT NULL;
