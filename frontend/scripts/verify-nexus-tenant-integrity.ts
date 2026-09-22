import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "database/migrations/032_nexus_tenant_integrity_hardening.sql",
  ),
  "utf8",
);

assert.equal(
  migration.includes("tenant-bound relational integrity"),
  true,
);
assert.equal(
  migration.includes("CREATE UNIQUE INDEX IF NOT EXISTS"),
  true,
);
assert.equal(
  migration.includes("FOREIGN KEY (tenant_id, %I)"),
  true,
);
assert.equal(
  migration.includes("REFERENCES %I (tenant_id, id)"),
  true,
);
assert.equal(
  migration.includes("NOT VALID"),
  true,
);
assert.equal(
  migration.includes("VALIDATE CONSTRAINT"),
  true,
);
assert.equal(
  migration.includes("c.conrelid::regclass::text LIKE 'safety\\_%'"),
  true,
);
assert.equal(
  migration.includes("a.attname <> 'tenant_id'"),
  true,
);
assert.equal(
  migration.includes("ON DELETE"),
  false,
  "Composite tenant FKs must not replace the existing FK delete semantics.",
);

const registry = readFileSync(
  path.join(process.cwd(), "lib/database/migration-registry.ts"),
  "utf8",
);
assert.equal(registry.includes('id: "032"'), true);
assert.equal(
  registry.includes('filename: "032_nexus_tenant_integrity_hardening.sql"'),
  true,
);

console.log("Nexus tenant-integrity hardening verification passed.");
