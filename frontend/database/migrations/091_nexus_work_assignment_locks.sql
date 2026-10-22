CREATE SEQUENCE IF NOT EXISTS nexus_record_lock_fencing_seq AS bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_package_assignment_scope ON literature_packages(id,tenant_id,workspace_id,environment);
CREATE TABLE IF NOT EXISTS nexus_record_assignments (
 assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL,
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 workspace_id uuid NOT NULL REFERENCES nexus_client_workspaces(id),
 environment text NOT NULL,
 stage text NOT NULL CHECK(stage IN ('HITS','SCREENING','MEDICAL_REVIEW')),
 assigned_to_user_id text NOT NULL,
 assigned_by_user_id text NOT NULL,
 status text NOT NULL DEFAULT 'ACCEPTED' CHECK(status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED','COMPLETED','CANCELLED')),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nexus_active_assignment_unique ON nexus_record_assignments(record_id,stage)
 WHERE status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED');
CREATE INDEX IF NOT EXISTS nexus_assignment_my_work ON nexus_record_assignments(tenant_id,workspace_id,environment,assigned_to_user_id,stage,status);
CREATE TABLE IF NOT EXISTS nexus_record_locks (
 record_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 workspace_id uuid NOT NULL REFERENCES nexus_client_workspaces(id),
 environment text NOT NULL,
 stage text NOT NULL CHECK(stage IN ('HITS','SCREENING','MEDICAL_REVIEW')),
 locked_by_user_id text NOT NULL,
 lock_token uuid NOT NULL UNIQUE,
 fencing_token bigint NOT NULL,
 acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS nexus_lock_expiry ON nexus_record_locks(expires_at);
CREATE INDEX IF NOT EXISTS nexus_lock_scope ON nexus_record_locks(tenant_id,workspace_id,environment,stage);
CREATE OR REPLACE FUNCTION nexus_sweep_expired_locks(batch_size int DEFAULT 1000) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE deleted_count integer;
BEGIN
 IF batch_size NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid batch size'; END IF;
 WITH expired AS (SELECT record_id FROM nexus_record_locks WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT batch_size FOR UPDATE SKIP LOCKED)
 DELETE FROM nexus_record_locks l USING expired e WHERE l.record_id=e.record_id;
 GET DIAGNOSTICS deleted_count=ROW_COUNT;
 RETURN deleted_count;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'nexus_record_assignments'::regclass AND conname = 'nexus_assignment_package_scope_fk') THEN
  ALTER TABLE nexus_record_assignments ADD CONSTRAINT nexus_assignment_package_scope_fk
   FOREIGN KEY (record_id,tenant_id,workspace_id,environment) REFERENCES literature_packages(id,tenant_id,workspace_id,environment) ON DELETE CASCADE;
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'nexus_record_locks'::regclass AND conname = 'nexus_lock_package_scope_fk') THEN
  ALTER TABLE nexus_record_locks ADD CONSTRAINT nexus_lock_package_scope_fk
   FOREIGN KEY (record_id,tenant_id,workspace_id,environment) REFERENCES literature_packages(id,tenant_id,workspace_id,environment) ON DELETE CASCADE;
 END IF;
END $$;
