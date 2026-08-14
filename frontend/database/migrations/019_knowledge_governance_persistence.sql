CREATE TABLE IF NOT EXISTS knowledge_governance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  knowledge_document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'effective', 'superseded', 'retired')),
  version_label text NOT NULL,
  effective_date date,
  review_due_date date,
  training_required boolean NOT NULL DEFAULT false,
  reviewer text,
  approver text,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, knowledge_document_id, version_label)
);

CREATE TABLE IF NOT EXISTS knowledge_governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  governance_record_id uuid NOT NULL REFERENCES knowledge_governance_records(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('submit_for_review', 'approve', 'reject', 'mark_effective', 'supersede', 'retire')),
  actor_id uuid REFERENCES application_users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  comment text,
  from_status text NOT NULL,
  to_status text NOT NULL,
  record_version integer NOT NULL CHECK (record_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_governance_tenant_status
  ON knowledge_governance_records (tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_governance_events_tenant_time
  ON knowledge_governance_events (tenant_id, created_at DESC);
