-- Nexus Release Hardening: tenant-bound relational integrity
--
-- Service-layer authorization remains authoritative, but tenant-scoped safety
-- records must also be impossible to cross-link at the PostgreSQL layer.
--
-- This migration is intentionally additive:
--   * existing single-column FKs remain in place and keep their ON DELETE actions;
--   * parent tables gain a unique (tenant_id, id) key;
--   * child safety_* tables gain validated composite tenant/entity FKs.
--
-- Validation is not waived. If historical cross-tenant data exists, migration
-- 032 fails and must be investigated before release.

DO $nexus_tenant_integrity$
DECLARE
  rel record;
  unique_index_name text;
  composite_fk_name text;
BEGIN
  FOR rel IN
    WITH tenant_tables AS (
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenant_id'
    )
    SELECT DISTINCT
      c.conrelid::regclass::text AS child_table,
      a.attname AS child_fk,
      c.confrelid::regclass::text AS parent_table
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.conrelid::regclass::text LIKE 'safety\_%' ESCAPE '\'
      AND c.conrelid::regclass::text IN (SELECT table_name FROM tenant_tables)
      AND c.confrelid::regclass::text IN (SELECT table_name FROM tenant_tables)
      AND a.attname <> 'tenant_id'
    ORDER BY 1, 2, 3
  LOOP
    unique_index_name :=
      left('uq_tenant_entity_' || rel.parent_table, 52)
      || '_' || substr(md5(rel.parent_table), 1, 8);

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (tenant_id, id)',
      unique_index_name,
      rel.parent_table
    );

    composite_fk_name :=
      left('fk_tenant_' || rel.child_table || '_' || rel.child_fk, 52)
      || '_' || substr(md5(rel.child_table || ':' || rel.child_fk || ':' || rel.parent_table), 1, 8);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint existing
      WHERE existing.conrelid = rel.child_table::regclass
        AND existing.conname = composite_fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I
           FOREIGN KEY (tenant_id, %I)
           REFERENCES %I (tenant_id, id)
           NOT VALID',
        rel.child_table,
        composite_fk_name,
        rel.child_fk,
        rel.parent_table
      );

      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        rel.child_table,
        composite_fk_name
      );
    END IF;
  END LOOP;
END
$nexus_tenant_integrity$;
