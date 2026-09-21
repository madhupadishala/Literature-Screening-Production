-- Nexus Sprint 7: Intake Disposition and Governed External Handoff

ALTER TABLE safety_intake_records
  DROP CONSTRAINT IF EXISTS safety_intake_records_status_check;

ALTER TABLE safety_intake_records
  ADD CONSTRAINT safety_intake_records_status_check
    CHECK (status IN (
      'RECEIVED',
      'IN_TRIAGE',
      'VALIDITY_REVIEW',
      'DUPLICATE_REVIEW',
      'READY_FOR_DISPOSITION',
      'READY_FOR_CASE',
      'CASE_CREATED',
      'EXPORTED',
      'DISPOSED',
      'HOLD',
      'NO_CASE',
      'REJECTED'
    ));

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS disposition_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (disposition_status IN ('NOT_STARTED', 'COMPLETE'));

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS disposition_type text
    CHECK (
      disposition_type IS NULL OR disposition_type IN (
        'CREATE_NEXUS_CASE',
        'EXPORT_EXTERNAL',
        'FOLLOW_UP_EXISTING_CASE',
        'DUPLICATE',
        'INCOMPLETE_FOLLOW_UP',
        'NON_CASE',
        'HOLD'
      )
    );

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS disposed_at timestamptz;

ALTER TABLE safety_intake_records
  ADD COLUMN IF NOT EXISTS disposed_by uuid
    REFERENCES application_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS safety_intake_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  disposition_version integer NOT NULL CHECK (disposition_version > 0),
  disposition_type text NOT NULL CHECK (
    disposition_type IN (
      'CREATE_NEXUS_CASE',
      'EXPORT_EXTERNAL',
      'FOLLOW_UP_EXISTING_CASE',
      'DUPLICATE',
      'INCOMPLETE_FOLLOW_UP',
      'NON_CASE',
      'HOLD'
    )
  ),
  target_case_id uuid REFERENCES safety_cases(id) ON DELETE SET NULL,
  target_intake_record_id uuid REFERENCES safety_intake_records(id) ON DELETE SET NULL,
  external_system text,
  external_case_reference text,
  external_handoff_package_id uuid,
  rationale text NOT NULL CHECK (length(trim(rationale)) >= 10),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  disposed_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  disposed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intake_record_id, disposition_version),
  CONSTRAINT safety_intake_disposition_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_intake_dispositions_intake
  ON safety_intake_dispositions (
    tenant_id, intake_record_id, disposition_version DESC
  );

CREATE TABLE IF NOT EXISTS safety_external_handoff_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_record_id uuid NOT NULL REFERENCES safety_intake_records(id) ON DELETE CASCADE,
  disposition_id uuid NOT NULL REFERENCES safety_intake_dispositions(id) ON DELETE CASCADE,
  destination_system text NOT NULL,
  package_format text NOT NULL DEFAULT 'NEXUS_SAFETY_JSON'
    CHECK (package_format IN ('NEXUS_SAFETY_JSON')),
  package_version integer NOT NULL DEFAULT 1 CHECK (package_version > 0),
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PREPARED'
    CHECK (status IN ('PREPARED', 'DOWNLOADED', 'ACKNOWLEDGED', 'CANCELLED')),
  prepared_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (tenant_id, disposition_id),
  CONSTRAINT safety_external_handoff_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

ALTER TABLE safety_intake_dispositions
  DROP CONSTRAINT IF EXISTS safety_intake_dispositions_external_handoff_package_id_fkey;

ALTER TABLE safety_intake_dispositions
  ADD CONSTRAINT safety_intake_dispositions_external_handoff_package_id_fkey
    FOREIGN KEY (external_handoff_package_id)
    REFERENCES safety_external_handoff_packages(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_safety_external_handoff_packages_intake
  ON safety_external_handoff_packages (
    tenant_id, intake_record_id, prepared_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_safety_intake_disposition_worklist
  ON safety_intake_records (
    tenant_id, disposition_status, disposition_type, updated_at DESC
  );
