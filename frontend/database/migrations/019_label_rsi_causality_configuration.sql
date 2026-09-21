-- Sprint 6: governed Label / RSI and Causality Method configuration resources

ALTER TABLE tenant_configuration_sets
  DROP CONSTRAINT IF EXISTS tenant_configuration_sets_resource_type_check;

ALTER TABLE tenant_configuration_sets
  ADD CONSTRAINT tenant_configuration_sets_resource_type_check
  CHECK (
    resource_type = ANY (
      ARRAY[
        'PRODUCT_MASTER'::text,
        'LITERATURE_CALENDAR'::text,
        'CLIENT_GUIDELINE'::text,
        'OUTCOME_TEMPLATE'::text,
        'LITERATURE_SOURCE'::text,
        'LABEL_REFERENCE'::text,
        'CAUSALITY_METHOD'::text
      ]
    )
  );

CREATE INDEX IF NOT EXISTS idx_configuration_active_resource_type
  ON tenant_configuration_versions (tenant_id, lifecycle_status, activated_at DESC)
  WHERE lifecycle_status = 'active';
