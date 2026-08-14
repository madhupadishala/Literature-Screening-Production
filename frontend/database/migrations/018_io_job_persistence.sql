CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key text,
  source_type text NOT NULL CHECK (source_type IN ('csv', 'excel', 'json', 'pdf', 'zip', 'api')),
  file_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  total_records integer NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  processed_records integer NOT NULL DEFAULT 0 CHECK (processed_records >= 0),
  failed_records integer NOT NULL DEFAULT 0 CHECK (failed_records >= 0),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_time ON import_jobs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key text,
  scope text NOT NULL CHECK (scope IN ('hits', 'screening', 'intake', 'qc', 'evidence', 'audit', 'reports', 'all')),
  format text NOT NULL CHECK (format IN ('csv', 'excel', 'json', 'pdf', 'zip')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  total_records integer NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  exported_records integer NOT NULL DEFAULT 0 CHECK (exported_records >= 0),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_tenant_time ON export_jobs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS export_job_contents (
  export_job_id uuid PRIMARY KEY REFERENCES export_jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content bytea NOT NULL,
  media_type text NOT NULL,
  file_name text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_job_contents_tenant
  ON export_job_contents (tenant_id, export_job_id);
