-- Controlled, workspace-scoped MAH product ownership records for AG01.
-- No tenant-global ownership inference, no default demo products.
CREATE TABLE IF NOT EXISTS nexus_client_product_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  product_key text NOT NULL,
  trade_name text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  governance_status text NOT NULL DEFAULT 'draft'
    CHECK (governance_status IN ('draft','approved','retired')),
  production_eligible boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL,
  effective_until date,
  source_document_key text NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_nexus_client_product_master_workspace
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES nexus_client_workspaces(tenant_id,id)
    ON DELETE RESTRICT,
  CONSTRAINT nexus_client_product_master_arrays_chk
    CHECK (jsonb_typeof(aliases) = 'array' AND jsonb_typeof(active_ingredients) = 'array'),
  CONSTRAINT nexus_client_product_master_dates_chk
    CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CONSTRAINT nexus_client_product_master_approved_chk
    CHECK (governance_status <> 'approved' OR
      (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE (tenant_id,workspace_id,product_key)
);
CREATE INDEX IF NOT EXISTS idx_nexus_client_products_effective
 ON nexus_client_product_master(tenant_id,workspace_id,governance_status,effective_from,effective_until)
 WHERE production_eligible IS TRUE;
