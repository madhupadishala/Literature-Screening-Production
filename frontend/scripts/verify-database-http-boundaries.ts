import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Pool } from "pg";

import {
  DELETE as deleteArtifact,
  GET as getArtifact,
} from "../app/api/evidence/artifacts/[artifactId]/route";
import { closePostgresPool } from "../lib/database/postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString: databaseUrl });

function request(
  method: "GET" | "DELETE",
  artifactId: string,
  tenantKey: string,
  email: string,
  body?: unknown,
) {
  return new NextRequest(
    `http://localhost/api/evidence/artifacts/${artifactId}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        "x-tenant-key": tenantKey,
        "x-user-email": email,
        "x-request-id": `qualification-${method.toLowerCase()}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

async function main() {
  const suffix = Date.now().toString();
  const tenantAKey = `qualification-a-${suffix}`;
  const tenantBKey = `qualification-b-${suffix}`;
  const emailA = `qualification-a-${suffix}@example.test`;
  const emailB = `qualification-b-${suffix}@example.test`;

  const tenantA = await pool.query<{ id: string }>(
    "INSERT INTO tenants (tenant_key, display_name) VALUES ($1, 'Qualification A') RETURNING id",
    [tenantAKey],
  );
  const tenantB = await pool.query<{ id: string }>(
    "INSERT INTO tenants (tenant_key, display_name) VALUES ($1, 'Qualification B') RETURNING id",
    [tenantBKey],
  );
  const userA = await pool.query<{ id: string }>(
    "INSERT INTO application_users (email, display_name) VALUES ($1, 'Qualification A') RETURNING id",
    [emailA],
  );
  const userB = await pool.query<{ id: string }>(
    "INSERT INTO application_users (email, display_name) VALUES ($1, 'Qualification B') RETURNING id",
    [emailB],
  );

  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role_key)
     VALUES ($1, $2, 'CLIENT_OWNER'), ($3, $4, 'CLIENT_OWNER')`,
    [tenantA.rows[0].id, userA.rows[0].id, tenantB.rows[0].id, userB.rows[0].id],
  );

  const pkg = await pool.query<{ id: string }>(
    `INSERT INTO literature_packages (
       tenant_id, package_key, source_type, created_by
     ) VALUES ($1, $2, 'PubMed', $3) RETURNING id`,
    [tenantA.rows[0].id, `PKG-${suffix}`, userA.rows[0].id],
  );
  const artifact = await pool.query<{ id: string }>(
    `INSERT INTO evidence_artifacts (
       tenant_id, package_id, artifact_type, storage_backend, storage_key,
       media_type, sha256, size_bytes, legal_hold
     ) VALUES ($1, $2, 'FULL_TEXT_PDF', 'postgres-bytea', $3,
       'application/pdf', $4, 15, true) RETURNING id`,
    [
      tenantA.rows[0].id,
      pkg.rows[0].id,
      `full-text/PMC${suffix}.pdf`,
      "a".repeat(64),
    ],
  );
  await pool.query(
    `INSERT INTO evidence_artifact_contents (artifact_id, tenant_id, content)
     VALUES ($1, $2, $3)`,
    [artifact.rows[0].id, tenantA.rows[0].id, Buffer.from("%PDF-test-data")],
  );

  const context = { params: Promise.resolve({ artifactId: artifact.rows[0].id }) };

  const crossTenant = await getArtifact(
    request("GET", artifact.rows[0].id, tenantBKey, emailB),
    context,
  );
  assert.equal(crossTenant.status, 404);

  const ownTenant = await getArtifact(
    request("GET", artifact.rows[0].id, tenantAKey, emailA),
    context,
  );
  assert.equal(ownTenant.status, 200);
  assert.equal(Buffer.from(await ownTenant.arrayBuffer()).toString(), "%PDF-test-data");

  const blockedDelete = await deleteArtifact(
    request("DELETE", artifact.rows[0].id, tenantAKey, emailA, {
      reason: "Qualification legal-hold deletion attempt",
    }),
    context,
  );
  assert.equal(blockedDelete.status, 400);

  const afterRollback = await pool.query<{
    deleted_at: Date | null;
    content_count: string;
    audit_count: string;
  }>(
    `SELECT
       a.deleted_at,
       (SELECT count(*) FROM evidence_artifact_contents c WHERE c.artifact_id = a.id) AS content_count,
       (SELECT count(*) FROM audit_events e
          WHERE e.event_type = 'EVIDENCE_ARTIFACT_DELETED'
            AND e.details->>'artifactId' = a.id::text) AS audit_count
     FROM evidence_artifacts a WHERE a.id = $1`,
    [artifact.rows[0].id],
  );
  assert.equal(afterRollback.rows[0].deleted_at, null);
  assert.equal(afterRollback.rows[0].content_count, "1");
  assert.equal(afterRollback.rows[0].audit_count, "0");

  await pool.query(
    "UPDATE evidence_artifacts SET legal_hold = false WHERE id = $1",
    [artifact.rows[0].id],
  );
  const deleted = await deleteArtifact(
    request("DELETE", artifact.rows[0].id, tenantAKey, emailA, {
      reason: "Qualification approved deletion",
    }),
    context,
  );
  assert.equal(deleted.status, 200);

  const afterDelete = await pool.query<{
    deleted: boolean;
    content_count: string;
    audit_count: string;
  }>(
    `SELECT
       a.deleted_at IS NOT NULL AS deleted,
       (SELECT count(*) FROM evidence_artifact_contents c WHERE c.artifact_id = a.id) AS content_count,
       (SELECT count(*) FROM audit_events e
          WHERE e.event_type = 'EVIDENCE_ARTIFACT_DELETED'
            AND e.details->>'artifactId' = a.id::text) AS audit_count
     FROM evidence_artifacts a WHERE a.id = $1`,
    [artifact.rows[0].id],
  );
  assert.equal(afterDelete.rows[0].deleted, true);
  assert.equal(afterDelete.rows[0].content_count, "0");
  assert.equal(afterDelete.rows[0].audit_count, "1");

  console.log(
    "Database-backed HTTP qualification passed: cross-tenant access denied, legal-hold rollback preserved content, and approved deletion committed with audit.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
    await pool.end();
  });
