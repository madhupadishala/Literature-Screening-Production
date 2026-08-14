import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { Pool } from "pg";
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
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function loadForQualification(
    requestName,
    parent,
    isMain,
  ) {
    if (requestName === "server-only") return {};
    return originalLoad.call(this, requestName, parent, isMain);
  };

  const {
    DELETE: deleteArtifact,
    GET: getArtifact,
  } = await import("../app/api/evidence/artifacts/[artifactId]/route");
  const { persistWorkflowArticle } = await import(
    "../lib/literature/persistence/workflow-persistence-service"
  );
  const { generateIntakeInput, getIntakeInputExport } = await import(
    "../lib/literature/intake-input/intake-input-service"
  );

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


  const rollbackPmid = `ROLLBACK-${suffix}`;
  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_workflow_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'LITERATURE_ARTICLE_PERSISTED'
         AND NEW.details->>'pmid' = '${rollbackPmid}' THEN
        RAISE EXCEPTION 'qualification forced persistence failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    DROP TRIGGER IF EXISTS qualification_fail_workflow_audit_trigger ON audit_events;
    CREATE TRIGGER qualification_fail_workflow_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION qualification_fail_workflow_audit();
  `);

  await assert.rejects(
    persistWorkflowArticle({
      tenantKey: tenantAKey,
      pmid: rollbackPmid,
      title: "Atomic rollback qualification",
      searchResult: { pmid: rollbackPmid },
      fetchResult: { pmid: rollbackPmid },
      duplicateResult: {
        isDuplicate: false,
        requiresReview: false,
        confidence: 100,
        matches: [],
      },
      screeningResult: {
        decision: "INCLUDE",
        confidence: 99,
      },
    }),
    /qualification forced persistence failure/i,
  );

  const rollbackState = await pool.query<{
    package_count: string;
    workflow_count: string;
    source_count: string;
    hits_count: string;
    screening_count: string;
    audit_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM literature_packages
          WHERE tenant_id = $1 AND package_key = $2) AS package_count,
       (SELECT count(*) FROM literature_workflow_state ws
          JOIN literature_packages p ON p.id = ws.package_id
          WHERE p.tenant_id = $1 AND p.package_key = $2) AS workflow_count,
       (SELECT count(*) FROM literature_package_sources s
          JOIN literature_packages p ON p.id = s.package_id
          WHERE p.tenant_id = $1 AND p.package_key = $2) AS source_count,
       (SELECT count(*) FROM hits_results h
          JOIN literature_packages p ON p.id = h.package_id
          WHERE p.tenant_id = $1 AND p.package_key = $2) AS hits_count,
       (SELECT count(*) FROM screening_results sr
          JOIN literature_packages p ON p.id = sr.package_id
          WHERE p.tenant_id = $1 AND p.package_key = $2) AS screening_count,
       (SELECT count(*) FROM audit_events
          WHERE tenant_id = $1 AND details->>'pmid' = $2) AS audit_count`,
    [tenantA.rows[0].id, rollbackPmid],
  );
  for (const count of Object.values(rollbackState.rows[0])) {
    assert.equal(count, "0");
  }

  await pool.query(`
    DROP TRIGGER qualification_fail_workflow_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_workflow_audit();
  `);

  const pkg = await pool.query<{ id: string }>(
    `INSERT INTO literature_packages (
       tenant_id, package_key, source_type, created_by
     ) VALUES ($1, $2, 'PubMed', $3) RETURNING id`,
    [tenantA.rows[0].id, `PKG-${suffix}`, userA.rows[0].id],
  );

  await pool.query(
    `INSERT INTO literature_workflow_state (
       package_id, tenant_id, workflow_state, state_payload, updated_by
     ) VALUES ($1, $2, 'SCREENING_COMPLETE', '{}'::jsonb, $3)`,
    [pkg.rows[0].id, tenantA.rows[0].id, userA.rows[0].id],
  );
  const canonicalScreening = {
    decision: "INCLUDE",
    patient: { identifiable: true, age: 42 },
    reporter: { identifiable: true, type: "physician" },
    suspectProducts: [{ name: "Qualification Product", role: "suspect" }],
    events: [{ term: "Qualification Event", serious: false }],
    sourceTextHash: "canonical-source-hash",
  };
  const screening = await pool.query<{ id: string }>(
    `INSERT INTO screening_results (
       tenant_id, package_id, result_version, decision, result_payload, confidence
     ) VALUES ($1, $2, 1, 'INCLUDE', $3::jsonb, 0.99) RETURNING id`,
    [tenantA.rows[0].id, pkg.rows[0].id, JSON.stringify(canonicalScreening)],
  );
  await pool.query(
    `INSERT INTO screening_reviews (
       tenant_id, package_id, screening_result_id, review_status,
       final_decision, comments, reviewed_by, reviewed_at
     ) VALUES ($1, $2, $3, 'approved', 'INCLUDE',
       'Qualification approval', $4, now())`,
    [
      tenantA.rows[0].id,
      pkg.rows[0].id,
      screening.rows[0].id,
      userA.rows[0].id,
    ],
  );

  const principal = {
    tenantId: tenantA.rows[0].id,
    tenantKey: tenantAKey,
    userId: userA.rows[0].id,
    email: emailA,
    displayName: "Qualification A",
    roleKey: "CLIENT_OWNER",
    customPermissions: [],
    hasPermission: () => true,
  };
  const firstIntake = await generateIntakeInput({
    principal,
    request: {
      packageId: pkg.rows[0].id,
      reason: "Qualification of canonical downstream reuse",
    },
  });
  assert.equal(firstIntake.reused, false);

  const downloadedIntake = await getIntakeInputExport({
    principal,
    exportId: firstIntake.exportId,
  });
  const screeningAssessment = downloadedIntake.payload.screening_assessment as {
    result: unknown;
  };
  assert.deepEqual(screeningAssessment.result, canonicalScreening);
  assert.deepEqual(downloadedIntake.payload.article, {
    pmid: undefined,
  }, "placeholder");

  const reusedIntake = await generateIntakeInput({
    principal,
    request: {
      packageId: pkg.rows[0].id,
      reason: "Qualification of canonical downstream reuse",
    },
  });
  assert.equal(reusedIntake.reused, true);
  assert.equal(reusedIntake.exportId, firstIntake.exportId);
  assert.equal(reusedIntake.sha256, firstIntake.sha256);

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
    "Database-backed qualification passed: workflow failure rolled back every write; cross-tenant access was denied; legal-hold rollback preserved content; approved deletion committed with audit.",
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
