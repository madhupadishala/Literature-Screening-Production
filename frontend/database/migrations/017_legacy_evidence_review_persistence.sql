CREATE TABLE IF NOT EXISTS evidence_package_snapshots (
  package_id uuid PRIMARY KEY REFERENCES literature_packages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_version integer NOT NULL DEFAULT 1 CHECK (package_version > 0),
  package_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'reviewed', 'approved', 'archived')),
  payload jsonb NOT NULL,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_package_snapshots_tenant_status
  ON evidence_package_snapshots (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS governed_review_records (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  article_id text,
  evidence_package_id text,
  workflow_stage text NOT NULL CHECK (workflow_stage IN ('hits', 'screening', 'intake', 'qc')),
  review_status text NOT NULL CHECK (review_status IN ('pending', 'approved', 'rejected', 'overridden')),
  payload jsonb NOT NULL,
  review_version integer NOT NULL DEFAULT 1 CHECK (review_version > 0),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, review_id)
);

CREATE INDEX IF NOT EXISTS idx_governed_review_records_tenant_stage
  ON governed_review_records (tenant_id, workflow_stage, updated_at DESC);
