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
  const { POST: createEvidencePackage } = await import("../app/api/evidence/package/route");
  const { POST: saveGovernedReview } = await import("../app/api/review/save/route");
  const { evidencePackageGenerator } = await import("../lib/evidence/evidence-package-generator");
  const { reviewRepository } = await import("../lib/review/review-store");
  const { POST: createImportJob } = await import("../app/api/io/import/route");
  const { POST: createExportJob } = await import("../app/api/io/export/route");
  const { GET: downloadExport } = await import("../app/api/io/export/[jobId]/route");
  const { importStore } = await import("../lib/io/import-store");
  const { exportStore } = await import("../lib/io/export-store");
  const {
    GET: getKnowledgeGovernance,
    POST: createKnowledgeGovernance,
    PATCH: transitionKnowledgeGovernance,
  } = await import("../app/api/knowledge/governance/route");
  const {
    GET: getKnowledgeRepository,
    POST: createKnowledgeDocument,
    PATCH: transitionKnowledgeDocument,
  } = await import("../app/api/knowledge/repository/route");
  const { POST: uploadStoredDocument } = await import("../app/api/storage/upload/route");
  const {
    GET: getStoredDocument,
    DELETE: deleteStoredDocument,
  } = await import("../app/api/storage/documents/[documentId]/route");
  const { GET: getJobs, POST: runJobs } = await import("../app/api/jobs/status/route");
  const {
    GET: getSchedules,
    POST: createSchedule,
    PATCH: dispatchSchedules,
  } = await import("../app/api/scheduler/status/route");
  const { jobQueue } = await import("../lib/jobs/job-queue");

  const suffix = Date.now().toString();
  const tenantAKey = `qualification-a-${suffix}`;
  const tenantBKey = `qualification-b-${suffix}`;
  const emailA = `qualification-a-${suffix}@example.test`;
  const emailB = `qualification-b-${suffix}@example.test`;
  const readOnlyEmail = `qualification-read-only-${suffix}@example.test`;

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
  const readOnlyUser = await pool.query<{ id: string }>(
    "INSERT INTO application_users (email, display_name) VALUES ($1, 'Qualification Read Only') RETURNING id",
    [readOnlyEmail],
  );

  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role_key)
     VALUES ($1, $2, 'CLIENT_OWNER'), ($3, $4, 'CLIENT_OWNER')`,
    [tenantA.rows[0].id, userA.rows[0].id, tenantB.rows[0].id, userB.rows[0].id],
  );
  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role_key)
     VALUES ($1, $2, 'READ_ONLY')`,
    [tenantA.rows[0].id, readOnlyUser.rows[0].id],
  );

  const schedulerHeaders = {
    "content-type": "application/json",
    "x-tenant-key": tenantAKey,
    "x-user-email": emailA,
    "x-idempotency-key": `qualification-schedule-${suffix}`,
    "x-request-id": `qualification-schedule-${suffix}`,
  };
  const scheduleBody = {
    tenantId: tenantB.rows[0].id,
    name: `Qualification once ${suffix}`,
    jobType: "system",
    frequency: "once",
    nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    payload: { qualification: true },
  };
  const firstScheduleResponse = await createSchedule(new NextRequest(
    "http://localhost/api/scheduler/status",
    { method: "POST", headers: schedulerHeaders, body: JSON.stringify(scheduleBody) },
  ));
  assert.equal(firstScheduleResponse.status, 201);
  const firstSchedule = (await firstScheduleResponse.json()) as {
    schedule: { id: string; tenantId: string };
  };
  assert.equal(firstSchedule.schedule.tenantId, tenantA.rows[0].id);
  const repeatedScheduleResponse = await createSchedule(new NextRequest(
    "http://localhost/api/scheduler/status",
    { method: "POST", headers: schedulerHeaders, body: JSON.stringify(scheduleBody) },
  ));
  const repeatedSchedule = (await repeatedScheduleResponse.json()) as {
    schedule: { id: string };
  };
  assert.equal(repeatedSchedule.schedule.id, firstSchedule.schedule.id);

  const tenantBSchedules = await getSchedules(new NextRequest(
    `http://localhost/api/scheduler/status?tenantId=${tenantA.rows[0].id}`,
    { headers: { "x-tenant-key": tenantBKey, "x-user-email": emailB } },
  ));
  const tenantBScheduleBody = (await tenantBSchedules.json()) as {
    schedules: Array<{ id: string }>;
  };
  assert.equal(tenantBScheduleBody.schedules.some(
    (schedule) => schedule.id === firstSchedule.schedule.id), false);
  const deniedSchedule = await createSchedule(new NextRequest(
    "http://localhost/api/scheduler/status",
    { method: "POST", headers: { "content-type": "application/json",
      "x-tenant-key": tenantAKey, "x-user-email": readOnlyEmail },
      body: JSON.stringify(scheduleBody) },
  ));
  assert.equal(deniedSchedule.status, 403);

  const dispatched = await dispatchSchedules(new NextRequest(
    "http://localhost/api/scheduler/status",
    { method: "PATCH", headers: schedulerHeaders },
  ));
  const dispatchedBody = (await dispatched.json()) as { count: number; createdJobIds: string[] };
  assert.equal(dispatchedBody.count, 1);
  const repeatedDispatch = await dispatchSchedules(new NextRequest(
    "http://localhost/api/scheduler/status",
    { method: "PATCH", headers: schedulerHeaders },
  ));
  assert.equal(((await repeatedDispatch.json()) as { count: number }).count, 0);

  const ownJobsResponse = await getJobs(new NextRequest(
    `http://localhost/api/jobs/status?tenantId=${tenantB.rows[0].id}`,
    { headers: { "x-tenant-key": tenantAKey, "x-user-email": emailA } },
  ));
  const ownJobs = (await ownJobsResponse.json()) as {
    data: { jobs: Array<{ id: string; tenantId: string }> };
  };
  assert.equal(ownJobs.data.jobs.some((job) => job.id === dispatchedBody.createdJobIds[0]), true);
  assert.equal(ownJobs.data.jobs.every((job) => job.tenantId === tenantA.rows[0].id), true);
  const crossTenantJobs = await getJobs(new NextRequest(
    "http://localhost/api/jobs/status",
    { headers: { "x-tenant-key": tenantBKey, "x-user-email": emailB } },
  ));
  const crossTenantJobBody = (await crossTenantJobs.json()) as {
    data: { jobs: Array<{ id: string }> };
  };
  assert.equal(crossTenantJobBody.data.jobs.some(
    (job) => job.id === dispatchedBody.createdJobIds[0]), false);
  const deniedRunner = await runJobs(new NextRequest("http://localhost/api/jobs/status", {
    method: "POST", headers: { "content-type": "application/json",
      "x-tenant-key": tenantAKey, "x-user-email": readOnlyEmail }, body: "{}",
  }));
  assert.equal(deniedRunner.status, 403);

  const claimJob = await jobQueue.enqueue({ tenantId: tenantA.rows[0].id, type: "system",
    payload: { claim: true }, maxAttempts: 2, createdBy: userA.rows[0].id,
    idempotencyKey: `qualification-claim-${suffix}` });
  const claims = await Promise.all([
    jobQueue.claimNext(tenantA.rows[0].id), jobQueue.claimNext(tenantA.rows[0].id),
  ]);
  const claimedIds = claims.filter(Boolean).map((job) => job?.id);
  assert.equal(new Set(claimedIds).size, claimedIds.length);
  assert.equal(claimedIds.includes(claimJob.id), true);
  await pool.query(`UPDATE background_jobs SET locked_until = now() - interval '1 minute'
    WHERE tenant_id = $1 AND id = $2`, [tenantA.rows[0].id, claimJob.id]);
  assert.equal(await jobQueue.recoverStaleClaims(tenantA.rows[0].id) >= 1, true);
  assert.equal((await jobQueue.get(tenantA.rows[0].id, claimJob.id))?.status, "queued");

  const rollbackJobKey = `rollback-background-job-${suffix}`;
  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_background_job_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'BACKGROUND_JOB_ENQUEUED'
         AND NEW.details->>'idempotencyKey' = '${rollbackJobKey}' THEN
        RAISE EXCEPTION 'qualification forced background job failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    CREATE TRIGGER qualification_fail_background_job_audit_trigger
      BEFORE INSERT ON audit_events FOR EACH ROW
      EXECUTE FUNCTION qualification_fail_background_job_audit();
  `);
  await assert.rejects(jobQueue.enqueue({ tenantId: tenantA.rows[0].id, type: "system",
    idempotencyKey: rollbackJobKey, createdBy: userA.rows[0].id }),
  /qualification forced background job failure/i);
  const rolledBackJob = await pool.query(
    `SELECT id FROM background_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantA.rows[0].id, rollbackJobKey]);
  assert.equal(rolledBackJob.rowCount, 0);
  await pool.query(`
    DROP TRIGGER qualification_fail_background_job_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_background_job_audit();
  `);

  const evidenceResponse = await createEvidencePackage(new NextRequest(
    "http://localhost/api/evidence/package",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-key": tenantAKey,
        "x-user-email": emailA,
        "x-request-id": `qualification-evidence-${suffix}`,
      },
      body: JSON.stringify({
        tenantId: tenantB.rows[0].id,
        articleId: `ARTICLE-${suffix}`,
        article: { authors: ["Qualification Author"], hasFullText: true, pmid: suffix },
        ragContext: {
          tenantId: tenantA.rows[0].id,
          query: `PMID:${suffix}`,
          summary: "Qualification context",
          chunks: [],
          sourceBreakdown: {},
          warnings: [],
          generatedAt: new Date().toISOString(),
        },
        aiExecution: {
          agentName: "Qualification Agent",
          agentVersion: "1",
          modelName: "qualification",
          modelVersion: "1",
          promptVersion: "1",
          confidence: 1,
          executedAt: new Date().toISOString(),
        },
        aiResult: { decision: "qualification" },
      }),
    },
  ));
  assert.equal(evidenceResponse.status, 201);
  const evidenceBody = await evidenceResponse.json() as { packageId: string };
  const ownPackage = await evidencePackageGenerator.get(
    tenantA.rows[0].id,
    evidenceBody.packageId,
  );
  assert.equal(ownPackage?.metadata.tenantId, tenantA.rows[0].id);
  assert.equal(
    await evidencePackageGenerator.get(tenantB.rows[0].id, evidenceBody.packageId),
    undefined,
  );

  const deniedEvidence = await createEvidencePackage(new NextRequest(
    "http://localhost/api/evidence/package",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-key": tenantAKey,
        "x-user-email": readOnlyEmail,
      },
      body: JSON.stringify({}),
    },
  ));
  assert.equal(deniedEvidence.status, 403);

  const reviewId = `REVIEW-${suffix}`;
  const reviewPayload = {
    id: reviewId,
    tenantId: tenantB.rows[0].id,
    articleId: `ARTICLE-${suffix}`,
    evidencePackageId: evidenceBody.packageId,
    workflowStage: "screening" as const,
    status: "approved" as const,
    aiExecution: {
      agentName: "Qualification Agent",
      agentVersion: "1",
      promptVersion: "1",
      modelName: "qualification",
      modelVersion: "1",
      confidence: 1,
      executedAt: new Date().toISOString(),
    },
    aiResult: { decision: "INCLUDE" },
    evidence: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const reviewResponse = await saveGovernedReview(new NextRequest(
    "http://localhost/api/review/save",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-key": tenantAKey,
        "x-user-email": emailA,
        "x-request-id": `qualification-review-${suffix}`,
      },
      body: JSON.stringify({ tenantId: tenantB.rows[0].id, review: reviewPayload }),
    },
  ));
  assert.equal(reviewResponse.status, 200);
  assert.equal(
    (await reviewRepository.get(tenantA.rows[0].id, reviewId))?.tenantId,
    tenantA.rows[0].id,
  );
  assert.equal(await reviewRepository.get(tenantB.rows[0].id, reviewId), undefined);

  const rollbackReviewId = `ROLLBACK-REVIEW-${suffix}`;
  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_review_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'GOVERNED_REVIEW_SAVED'
         AND NEW.details->>'reviewId' = '${rollbackReviewId}' THEN
        RAISE EXCEPTION 'qualification forced review persistence failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    CREATE TRIGGER qualification_fail_review_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION qualification_fail_review_audit();
  `);
  await assert.rejects(
    reviewRepository.save(
      { ...reviewPayload, id: rollbackReviewId, tenantId: tenantA.rows[0].id },
      userA.rows[0].id,
    ),
    /qualification forced review persistence failure/i,
  );
  assert.equal(await reviewRepository.get(tenantA.rows[0].id, rollbackReviewId), undefined);
  await pool.query(`
    DROP TRIGGER qualification_fail_review_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_review_audit();
  `);

  const ioHeaders = {
    "content-type": "application/json",
    "x-tenant-key": tenantAKey,
    "x-user-email": emailA,
    "x-idempotency-key": `qualification-io-${suffix}`,
    "x-request-id": `qualification-io-${suffix}`,
  };
  const importBody = {
    tenantId: tenantB.rows[0].id,
    sourceType: "csv",
    fileName: "qualification.csv",
    totalRecords: 2,
    metadata: { sourceSha256: "b".repeat(64) },
  };
  const firstImportResponse = await createImportJob(new NextRequest(
    "http://localhost/api/io/import",
    { method: "POST", headers: ioHeaders, body: JSON.stringify(importBody) },
  ));
  assert.equal(firstImportResponse.status, 200);
  const firstImport = (await firstImportResponse.json()) as { data: { id: string } };
  const repeatedImportResponse = await createImportJob(new NextRequest(
    "http://localhost/api/io/import",
    { method: "POST", headers: ioHeaders, body: JSON.stringify(importBody) },
  ));
  const repeatedImport = (await repeatedImportResponse.json()) as { data: { id: string } };
  assert.equal(repeatedImport.data.id, firstImport.data.id);
  assert.equal((await importStore.get(tenantA.rows[0].id, firstImport.data.id))?.tenantId,
    tenantA.rows[0].id);
  assert.equal(await importStore.get(tenantB.rows[0].id, firstImport.data.id), undefined);

  const exportBody = { tenantId: tenantB.rows[0].id, scope: "screening", format: "json" };
  const firstExportResponse = await createExportJob(new NextRequest(
    "http://localhost/api/io/export",
    { method: "POST", headers: ioHeaders, body: JSON.stringify(exportBody) },
  ));
  assert.equal(firstExportResponse.status, 200);
  const firstExport = (await firstExportResponse.json()) as { data: { id: string } };
  const repeatedExportResponse = await createExportJob(new NextRequest(
    "http://localhost/api/io/export",
    { method: "POST", headers: ioHeaders, body: JSON.stringify(exportBody) },
  ));
  const repeatedExport = (await repeatedExportResponse.json()) as { data: { id: string } };
  assert.equal(repeatedExport.data.id, firstExport.data.id);
  const exportBytes = Buffer.from('{"qualification":true}');
  await exportStore.attachContent({
    tenantId: tenantA.rows[0].id,
    jobId: firstExport.data.id,
    bytes: exportBytes,
    mediaType: "application/json",
    fileName: "qualification.json",
    actorId: userA.rows[0].id,
  });
  const ownExport = await downloadExport(
    new NextRequest(`http://localhost/api/io/export/${firstExport.data.id}`, {
      headers: { "x-tenant-key": tenantAKey, "x-user-email": emailA },
    }),
    { params: Promise.resolve({ jobId: firstExport.data.id }) },
  );
  assert.equal(ownExport.status, 200);
  assert.equal(Buffer.from(await ownExport.arrayBuffer()).toString(), exportBytes.toString());
  assert.match(ownExport.headers.get("x-content-sha256") ?? "", /^[0-9a-f]{64}$/);
  const crossTenantExport = await downloadExport(
    new NextRequest(`http://localhost/api/io/export/${firstExport.data.id}`, {
      headers: { "x-tenant-key": tenantBKey, "x-user-email": emailB },
    }),
    { params: Promise.resolve({ jobId: firstExport.data.id }) },
  );
  assert.equal(crossTenantExport.status, 404);
  const deniedExport = await createExportJob(new NextRequest("http://localhost/api/io/export", {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-key": tenantAKey,
      "x-user-email": readOnlyEmail },
    body: JSON.stringify(exportBody),
  }));
  assert.equal(deniedExport.status, 403);

  const rollbackIdempotencyKey = `rollback-export-${suffix}`;
  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_export_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'EXPORT_JOB_CREATED'
         AND NEW.details->>'idempotencyKey' = '${rollbackIdempotencyKey}' THEN
        RAISE EXCEPTION 'qualification forced export persistence failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    CREATE TRIGGER qualification_fail_export_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION qualification_fail_export_audit();
  `);
  await assert.rejects(exportStore.create({
    tenantId: tenantA.rows[0].id,
    scope: "screening",
    format: "json",
    requestedBy: userA.rows[0].id,
    idempotencyKey: rollbackIdempotencyKey,
  }), /qualification forced export persistence failure/i);
  const rolledBackExport = await pool.query(
    `SELECT id FROM export_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantA.rows[0].id, rollbackIdempotencyKey],
  );
  assert.equal(rolledBackExport.rowCount, 0);
  await pool.query(`
    DROP TRIGGER qualification_fail_export_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_export_audit();
  `);

  const governanceHeaders = {
    "content-type": "application/json",
    "x-tenant-key": tenantAKey,
    "x-user-email": emailA,
    "x-request-id": `qualification-governance-${suffix}`,
  };
  const knowledgeInput = {
    tenantId: tenantB.rows[0].id,
    title: `Qualification SOP ${suffix}`,
    category: "sop",
    version: "1.0",
    sourceAuthority: "ClinixAI Qualification",
    tags: ["qualification"],
    content: "Controlled qualification knowledge content",
  };
  const knowledgeCreate = await createKnowledgeDocument(new NextRequest(
    "http://localhost/api/knowledge/repository",
    { method: "POST", headers: governanceHeaders, body: JSON.stringify(knowledgeInput) },
  ));
  assert.equal(knowledgeCreate.status, 201);
  const createdKnowledge = (await knowledgeCreate.json()) as {
    document: { id: string; tenantId: string; content: string; status: string };
  };
  assert.equal(createdKnowledge.document.tenantId, tenantA.rows[0].id);
  assert.equal(createdKnowledge.document.content, knowledgeInput.content);
  const knowledgeDocument = { rows: [{ id: createdKnowledge.document.id }] };

  const versionConflict = await createKnowledgeDocument(new NextRequest(
    "http://localhost/api/knowledge/repository",
    { method: "POST", headers: governanceHeaders, body: JSON.stringify(knowledgeInput) },
  ));
  assert.equal(versionConflict.status, 409);
  const tenantBKnowledge = await getKnowledgeRepository(new NextRequest(
    "http://localhost/api/knowledge/repository",
    { headers: { "x-tenant-key": tenantBKey, "x-user-email": emailB } },
  ));
  const tenantBKnowledgeBody = (await tenantBKnowledge.json()) as {
    documents: Array<{ id: string }>;
  };
  assert.equal(tenantBKnowledgeBody.documents.some(
    (document) => document.id === createdKnowledge.document.id), false);
  const deniedKnowledge = await transitionKnowledgeDocument(new NextRequest(
    "http://localhost/api/knowledge/repository",
    { method: "PATCH", headers: { "content-type": "application/json",
      "x-tenant-key": tenantAKey, "x-user-email": readOnlyEmail },
      body: JSON.stringify({ documentId: createdKnowledge.document.id, action: "activate" }) },
  ));
  assert.equal(deniedKnowledge.status, 403);

  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_knowledge_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'KNOWLEDGE_DOCUMENT_STATUS_CHANGED'
         AND NEW.details->>'documentId' = '${createdKnowledge.document.id}'
         AND NEW.details->>'action' = 'activate' THEN
        RAISE EXCEPTION 'qualification forced knowledge persistence failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    CREATE TRIGGER qualification_fail_knowledge_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION qualification_fail_knowledge_audit();
  `);
  const failedActivation = await transitionKnowledgeDocument(new NextRequest(
    "http://localhost/api/knowledge/repository",
    { method: "PATCH", headers: governanceHeaders,
      body: JSON.stringify({ documentId: createdKnowledge.document.id, action: "activate" }) },
  ));
  assert.equal(failedActivation.status, 500);
  const afterKnowledgeRollback = await pool.query<{ governance_status: string }>(
    `SELECT governance_status FROM knowledge_documents WHERE id = $1`,
    [createdKnowledge.document.id],
  );
  assert.equal(afterKnowledgeRollback.rows[0].governance_status, "draft");
  await pool.query(`
    DROP TRIGGER qualification_fail_knowledge_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_knowledge_audit();
  `);
  for (const action of ["activate", "supersede"]) {
    const lifecycleResponse = await transitionKnowledgeDocument(new NextRequest(
      "http://localhost/api/knowledge/repository",
      { method: "PATCH", headers: governanceHeaders,
        body: JSON.stringify({ documentId: createdKnowledge.document.id, action }) },
    ));
    assert.equal(lifecycleResponse.status, 200);
  }
  const governanceCreate = await createKnowledgeGovernance(new NextRequest(
    "http://localhost/api/knowledge/governance",
    {
      method: "POST",
      headers: governanceHeaders,
      body: JSON.stringify({
        tenantId: tenantB.rows[0].id,
        knowledgeDocumentId: knowledgeDocument.rows[0].id,
        version: "1.0",
        trainingRequired: true,
      }),
    },
  ));
  assert.equal(governanceCreate.status, 201);
  const governanceRecord = (await governanceCreate.json()) as { record: { id: string } };
  const governanceList = await getKnowledgeGovernance(new NextRequest(
    "http://localhost/api/knowledge/governance",
    { headers: { "x-tenant-key": tenantAKey, "x-user-email": emailA } },
  ));
  const governanceListBody = (await governanceList.json()) as {
    records: Array<{ id: string; tenantId: string }>;
  };
  assert.equal(governanceListBody.records[0].tenantId, tenantA.rows[0].id);

  const crossTenantTransition = await transitionKnowledgeGovernance(new NextRequest(
    "http://localhost/api/knowledge/governance",
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-tenant-key": tenantBKey,
        "x-user-email": emailB },
      body: JSON.stringify({ governanceRecordId: governanceRecord.record.id,
        action: "submit_for_review", tenantId: tenantA.rows[0].id }),
    },
  ));
  assert.equal(crossTenantTransition.status, 404);
  const deniedGovernance = await transitionKnowledgeGovernance(new NextRequest(
    "http://localhost/api/knowledge/governance",
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-tenant-key": tenantAKey,
        "x-user-email": readOnlyEmail },
      body: JSON.stringify({ governanceRecordId: governanceRecord.record.id,
        action: "submit_for_review" }),
    },
  ));
  assert.equal(deniedGovernance.status, 403);

  for (const action of ["submit_for_review", "approve"]) {
    const transition = await transitionKnowledgeGovernance(new NextRequest(
      "http://localhost/api/knowledge/governance",
      { method: "PATCH", headers: governanceHeaders,
        body: JSON.stringify({ governanceRecordId: governanceRecord.record.id, action }) },
    ));
    assert.equal(transition.status, 200);
  }
  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_governance_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'KNOWLEDGE_GOVERNANCE_TRANSITION'
         AND NEW.details->>'governanceRecordId' = '${governanceRecord.record.id}'
         AND NEW.details->>'action' = 'mark_effective' THEN
        RAISE EXCEPTION 'qualification forced governance persistence failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    CREATE TRIGGER qualification_fail_governance_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION qualification_fail_governance_audit();
  `);
  const failedEffective = await transitionKnowledgeGovernance(new NextRequest(
    "http://localhost/api/knowledge/governance",
    { method: "PATCH", headers: governanceHeaders,
      body: JSON.stringify({ governanceRecordId: governanceRecord.record.id,
        action: "mark_effective" }) },
  ));
  assert.equal(failedEffective.status, 500);
  const governanceAfterRollback = await pool.query<{ status: string; effective_events: string }>(
    `SELECT record.status,
       (SELECT count(*) FROM knowledge_governance_events event
         WHERE event.governance_record_id = record.id AND event.action = 'mark_effective') AS effective_events
     FROM knowledge_governance_records record WHERE record.id = $1`,
    [governanceRecord.record.id],
  );
  assert.equal(governanceAfterRollback.rows[0].status, "approved");
  assert.equal(governanceAfterRollback.rows[0].effective_events, "0");
  await pool.query(`
    DROP TRIGGER qualification_fail_governance_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_governance_audit();
  `);

  const storedContent = "Qualification generic document content";
  const storageHeaders = {
    "content-type": "application/json",
    "x-tenant-key": tenantAKey,
    "x-user-email": emailA,
    "x-request-id": `qualification-storage-${suffix}`,
  };
  const uploadResponse = await uploadStoredDocument(new NextRequest(
    "http://localhost/api/storage/upload",
    {
      method: "POST",
      headers: storageHeaders,
      body: JSON.stringify({
        tenantId: tenantB.rows[0].id,
        category: "knowledge",
        documentType: "sop",
        fileName: "qualification.txt",
        contentType: "text/plain",
        content: storedContent,
        retentionPolicy: "selective",
      }),
    },
  ));
  assert.equal(uploadResponse.status, 200);
  const uploaded = (await uploadResponse.json()) as {
    data: { id: string; tenantId: string; checksum: string };
  };
  assert.equal(uploaded.data.tenantId, tenantA.rows[0].id);
  assert.match(uploaded.data.checksum, /^[0-9a-f]{64}$/);
  const storageContext = { params: Promise.resolve({ documentId: uploaded.data.id }) };
  const ownStoredDocument = await getStoredDocument(new NextRequest(
    `http://localhost/api/storage/documents/${uploaded.data.id}`,
    { headers: { "x-tenant-key": tenantAKey, "x-user-email": emailA } },
  ), storageContext);
  assert.equal(ownStoredDocument.status, 200);
  assert.equal(Buffer.from(await ownStoredDocument.arrayBuffer()).toString(), storedContent);
  assert.equal(ownStoredDocument.headers.get("x-content-sha256"), uploaded.data.checksum);
  const crossTenantStoredDocument = await getStoredDocument(new NextRequest(
    `http://localhost/api/storage/documents/${uploaded.data.id}`,
    { headers: { "x-tenant-key": tenantBKey, "x-user-email": emailB } },
  ), storageContext);
  assert.equal(crossTenantStoredDocument.status, 404);

  await pool.query(`UPDATE stored_documents SET legal_hold = true WHERE id = $1`, [uploaded.data.id]);
  const heldDelete = await deleteStoredDocument(new NextRequest(
    `http://localhost/api/storage/documents/${uploaded.data.id}`,
    { method: "DELETE", headers: storageHeaders,
      body: JSON.stringify({ reason: "Qualification held delete" }) },
  ), storageContext);
  assert.equal(heldDelete.status, 400);
  await pool.query(`UPDATE stored_documents SET legal_hold = false WHERE id = $1`, [uploaded.data.id]);

  await pool.query(`
    CREATE OR REPLACE FUNCTION qualification_fail_document_audit()
    RETURNS trigger LANGUAGE plpgsql AS $qualification$
    BEGIN
      IF NEW.event_type = 'DOCUMENT_DELETED'
         AND NEW.details->>'documentId' = '${uploaded.data.id}' THEN
        RAISE EXCEPTION 'qualification forced document deletion failure';
      END IF;
      RETURN NEW;
    END;
    $qualification$;
    CREATE TRIGGER qualification_fail_document_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION qualification_fail_document_audit();
  `);
  const failedStoredDelete = await deleteStoredDocument(new NextRequest(
    `http://localhost/api/storage/documents/${uploaded.data.id}`,
    { method: "DELETE", headers: storageHeaders,
      body: JSON.stringify({ reason: "Qualification rollback delete" }) },
  ), storageContext);
  assert.equal(failedStoredDelete.status, 500);
  const storedAfterRollback = await pool.query<{ status: string; content_count: string }>(
    `SELECT document.status,
       (SELECT count(*) FROM stored_document_contents contents
         WHERE contents.document_id = document.id) AS content_count
     FROM stored_documents document WHERE document.id = $1`,
    [uploaded.data.id],
  );
  assert.equal(storedAfterRollback.rows[0].status, "active");
  assert.equal(storedAfterRollback.rows[0].content_count, "1");
  await pool.query(`
    DROP TRIGGER qualification_fail_document_audit_trigger ON audit_events;
    DROP FUNCTION qualification_fail_document_audit();
  `);
  const completedStoredDelete = await deleteStoredDocument(new NextRequest(
    `http://localhost/api/storage/documents/${uploaded.data.id}`,
    { method: "DELETE", headers: storageHeaders,
      body: JSON.stringify({ reason: "Qualification approved delete" }) },
  ), storageContext);
  assert.equal(completedStoredDelete.status, 200);
  const storedAfterDelete = await pool.query<{ status: string; content_count: string; audit_count: string }>(
    `SELECT document.status,
       (SELECT count(*) FROM stored_document_contents contents
         WHERE contents.document_id = document.id) AS content_count,
       (SELECT count(*) FROM audit_events event WHERE event.event_type = 'DOCUMENT_DELETED'
         AND event.details->>'documentId' = document.id::text) AS audit_count
     FROM stored_documents document WHERE document.id = $1`,
    [uploaded.data.id],
  );
  assert.equal(storedAfterDelete.rows[0].status, "deleted");
  assert.equal(storedAfterDelete.rows[0].content_count, "0");
  assert.equal(storedAfterDelete.rows[0].audit_count, "1");


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
    "Database-backed qualification passed: workflow, review, export, knowledge, governance, and generic-document failures rolled back every write; tenant spoofing was neutralized; export, knowledge, and document provenance were preserved; cross-tenant access and unauthorized lifecycle changes were denied; legal holds preserved content; approved deletions committed with audit.",
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
