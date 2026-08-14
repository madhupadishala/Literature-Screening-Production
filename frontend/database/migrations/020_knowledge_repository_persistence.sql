ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES application_users(id) ON DELETE SET NULL;

ALTER TABLE knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_governance_status_check;
ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_governance_status_check
  CHECK (governance_status IN ('draft', 'approved', 'effective', 'superseded', 'retired'));

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_status_time
  ON knowledge_documents (tenant_id, governance_status, updated_at DESC);
