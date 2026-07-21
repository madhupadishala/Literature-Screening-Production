CREATE TABLE IF NOT EXISTS release_governance_state (
  environment text PRIMARY KEY,
  state_version integer NOT NULL DEFAULT 1 CHECK (state_version > 0),
  state_payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_governance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  state_version integer NOT NULL CHECK (state_version > 0),
  action text NOT NULL,
  state_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, state_version)
);

CREATE INDEX IF NOT EXISTS idx_release_governance_history_time
  ON release_governance_history (environment, recorded_at DESC);

CREATE OR REPLACE FUNCTION prevent_release_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'release_governance_history is append-only; % is prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS release_governance_history_append_only
  ON release_governance_history;

CREATE TRIGGER release_governance_history_append_only
BEFORE UPDATE OR DELETE ON release_governance_history
FOR EACH ROW EXECUTE FUNCTION prevent_release_history_mutation();
