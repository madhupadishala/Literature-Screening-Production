-- Nexus Sprint 10: Case Evidence, Export and Release Hardening

CREATE TABLE IF NOT EXISTS safety_case_evidence_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  case_version_id uuid NOT NULL REFERENCES safety_case_versions(id) ON DELETE RESTRICT,
  package_version integer NOT NULL CHECK (package_version > 0),
  manifest jsonb NOT NULL,
  package_payload jsonb NOT NULL,
  package_sha256 text NOT NULL CHECK (package_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'GENERATED'
    CHECK (status IN ('GENERATED', 'RETIRED')),
  generated_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_id, package_version),
  CONSTRAINT safety_case_evidence_manifest_object
    CHECK (jsonb_typeof(manifest) = 'object'),
  CONSTRAINT safety_case_evidence_payload_object
    CHECK (jsonb_typeof(package_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_safety_case_evidence_packages
  ON safety_case_evidence_packages (
    tenant_id, case_id, package_version DESC
  );

CREATE TABLE IF NOT EXISTS safety_case_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  case_version_id uuid NOT NULL REFERENCES safety_case_versions(id) ON DELETE RESTRICT,
  evidence_package_id uuid REFERENCES safety_case_evidence_packages(id) ON DELETE SET NULL,
  export_format text NOT NULL CHECK (
    export_format IN (
      'NEXUS_CASE_JSON',
      'E2B_R3_MAPPING_JSON',
      'HUMAN_READABLE_HTML'
    )
  ),
  export_version integer NOT NULL CHECK (export_version > 0),
  payload_json jsonb,
  content_text text,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  generated_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_id, export_format, export_version),
  CONSTRAINT safety_case_export_content_chk CHECK (
    payload_json IS NOT NULL OR content_text IS NOT NULL
  ),
  CONSTRAINT safety_case_export_payload_object CHECK (
    payload_json IS NULL OR jsonb_typeof(payload_json) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_safety_case_exports_case
  ON safety_case_exports (
    tenant_id, case_id, export_format, export_version DESC
  );
