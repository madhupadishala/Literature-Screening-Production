CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_category_time
  ON audit_events (tenant_id, event_category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_type_time
  ON audit_events (tenant_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_actor_time
  ON audit_events (tenant_id, actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % is prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
