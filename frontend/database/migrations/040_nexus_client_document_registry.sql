-- Durable private document registry; never infer client ownership from filenames.
CREATE TABLE IF NOT EXISTS nexus_document_objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK (environment IN ('PROD','UAT','TRAINING')),
 intake_record_id uuid,
 case_id uuid,
 object_key text NOT NULL UNIQUE,
 bucket text NOT NULL,
 content_type text NOT NULL,
 original_filename text NOT NULL,
 bytes bigint NOT NULL CHECK (bytes > 0 AND bytes <= 104857600),
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 document_type text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','ACTIVE','ARCHIVED','FAILED')),
 created_by uuid NOT NULL REFERENCES application_users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 archived_at timestamptz,
 CONSTRAINT nexus_document_workspace_fk FOREIGN KEY (tenant_id,workspace_id)
   REFERENCES nexus_client_workspaces(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT nexus_document_intake_fk FOREIGN KEY (tenant_id,workspace_id,environment,intake_record_id)
   REFERENCES safety_intake_records(tenant_id,workspace_id,environment,id),
 CONSTRAINT nexus_document_case_fk FOREIGN KEY (tenant_id,workspace_id,environment,case_id)
   REFERENCES safety_cases(tenant_id,workspace_id,environment,id),
 CONSTRAINT nexus_document_owner_chk CHECK (intake_record_id IS NOT NULL OR case_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS nexus_documents_case_scope ON nexus_document_objects(tenant_id,workspace_id,environment,case_id,created_at DESC);
CREATE INDEX IF NOT EXISTS nexus_documents_intake_scope ON nexus_document_objects(tenant_id,workspace_id,environment,intake_record_id,created_at DESC);
