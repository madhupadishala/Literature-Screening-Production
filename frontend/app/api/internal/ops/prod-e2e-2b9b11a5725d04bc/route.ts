import { createHash } from "node:crypto";

import { executeAdHocSearch } from "@/lib/literature/adhoc-search/search-service";
import { executeProductionSearchToHits } from "@/lib/literature/hits/production-search-to-hits-service";
import { saveHitsReview } from "@/lib/literature/hits/hits-review-repository";
import {
  executeScreening,
  saveScreeningReview,
} from "@/lib/literature/screening/screening-workflow-service";
import {
  savePatientSegmentation,
  saveLabelAssessments,
  saveCausalityAssessments,
  saveMedicalReview,
} from "@/lib/literature/review/review-mutation-service";
import { generateIntakeInput } from "@/lib/literature/intake-input/intake-input-service";
import { getPostgresPool } from "@/lib/database/postgres";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { importLiteratureIntakeExport } from "@/lib/safety/common/safety-backbone-service";
import { completeIntakeSourceReview } from "@/lib/safety/intake/intake-review-service";
import {
  getTriageWorkspace,
  finalizeTriageAssessment,
} from "@/lib/safety/triage/triage-service";
import {
  runDuplicateSearch,
  finalizeDuplicateReview,
} from "@/lib/safety/duplicate/duplicate-service";
import { finalizeIntakeDisposition } from "@/lib/safety/disposition/disposition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEST_ID = "PROD-E2E-HITS-L2A-42573610-20261003-A";
const EXPECTED_TOKEN_SHA256 =
  "e3c4fb9dfa8a958b4e1af8c76f649176efef713a0b8c2937dc775efd59143cd8";
const TENANT_ID = "c3570ce0-6492-4dac-ba40-c0363b2835a4";
const TENANT_KEY = "clinixai-prod";
const WORKSPACE_ID = "8c2b32e2-6816-4265-9e71-48411d5207c4";
const USER_ID = "01e00a97-ff7f-4908-b84d-563766d9bff7";
const USER_EMAIL = "support@theclinixai.com";
const ROLE_KEY = "CLINIXAI_SUPER_ADMIN";
const PMID = "42573610";

function authorized(token: string | null): boolean {
  if (!token) return false;
  return (
    createHash("sha256").update(token, "utf8").digest("hex") ===
    EXPECTED_TOKEN_SHA256
  );
}

function principal(): RequestPrincipal {
  return {
    tenantId: TENANT_ID,
    tenantKey: TENANT_KEY,
    environment: "PROD",
    userId: USER_ID,
    email: USER_EMAIL,
    displayName: "ClinixAI Super Admin",
    roleKey: ROLE_KEY,
    customPermissions: [],
    hasPermission: (permission: Permission) =>
      roleHasPermission(ROLE_KEY, permission, []),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function recordEvent(
  eventType: string,
  outcome: string,
  details: Record<string, unknown>,
): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO audit_events (
       tenant_id, workspace_id, environment, module_key, actor_id,
       event_type, event_category, outcome, details
     ) VALUES ($1,$2,'PROD','LITERATURE',$3,$4,'PRODUCTION_E2E_VALIDATION',$5,$6::jsonb)`,
    [
      TENANT_ID,
      WORKSPACE_ID,
      USER_ID,
      eventType,
      outcome,
      JSON.stringify({ testId: TEST_ID, ...details }),
    ],
  );
}

async function assertProductionAccess(): Promise<void> {
  const result = await getPostgresPool().query<{ module_key: string }>(
    `SELECT entitlement.module_key
       FROM nexus_workspace_memberships membership
       JOIN nexus_workspace_module_entitlements entitlement
         ON entitlement.tenant_id = membership.tenant_id
        AND entitlement.workspace_id = membership.workspace_id
       JOIN nexus_workspace_module_roles role
         ON role.tenant_id = membership.tenant_id
        AND role.workspace_id = membership.workspace_id
        AND role.user_id = membership.user_id
        AND role.environment = entitlement.environment
        AND role.module_key = entitlement.module_key
      WHERE membership.tenant_id = $1
        AND membership.workspace_id = $2
        AND membership.user_id = $3
        AND membership.status = 'active'
        AND entitlement.environment = 'PROD'
        AND entitlement.status = 'enabled'
        AND role.status = 'active'
        AND entitlement.module_key = ANY($4::text[])`,
    [TENANT_ID, WORKSPACE_ID, USER_ID, ["LITERATURE", "INTAKE", "CASE_PROCESSING"]],
  );
  const modules = new Set(result.rows.map((row) => row.module_key));
  for (const moduleKey of ["LITERATURE", "INTAKE", "CASE_PROCESSING"]) {
    if (!modules.has(moduleKey)) {
      throw new Error(`Production workspace access missing for ${moduleKey}.`);
    }
  }

  const productMaster = await getPostgresPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM tenant_configuration_versions version
       JOIN tenant_configuration_sets config_set
         ON config_set.id = version.config_set_id
      WHERE version.tenant_id = $1
        AND config_set.resource_type = 'PRODUCT_MASTER'
        AND version.lifecycle_status = 'active'
        AND (version.effective_from IS NULL OR version.effective_from <= now())
        AND (version.effective_to IS NULL OR version.effective_to > now())`,
    [TENANT_ID],
  );
  if (Number(productMaster.rows[0]?.count ?? 0) < 1) {
    throw new Error("No active governed Product Master is available for the production validation.");
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json({ success: false, error: "Production-only validation endpoint." }, { status: 404 });
  }
  if (!authorized(url.searchParams.get("token"))) {
    return Response.json({ success: false, error: "Not found." }, { status: 404 });
  }

  const pool = getPostgresPool();
  const existing = await pool.query<{ event_type: string; outcome: string; details: Record<string, unknown> }>(
    `SELECT event_type, outcome, details
       FROM audit_events
      WHERE tenant_id = $1
        AND event_category = 'PRODUCTION_E2E_VALIDATION'
        AND details->>'testId' = $2
      ORDER BY occurred_at DESC`,
    [TENANT_ID, TEST_ID],
  );

  const completed = existing.rows.find(
    (row) => row.event_type === "PRODUCTION_E2E_HITS_TO_L2A_COMPLETED",
  );
  if (completed) {
    return Response.json({
      success: true,
      reused: true,
      testId: TEST_ID,
      result: completed.details,
    });
  }
  if (existing.rows.some((row) => row.event_type === "PRODUCTION_E2E_HITS_TO_L2A_STARTED")) {
    return Response.json(
      {
        success: false,
        testId: TEST_ID,
        error: "This one-time production validation has already started. Inspect its audit trail before retrying.",
        audit: existing.rows,
      },
      { status: 409 },
    );
  }

  const actor = principal();
  const steps: Array<Record<string, unknown>> = [];

  try {
    await assertProductionAccess();
    await recordEvent("PRODUCTION_E2E_HITS_TO_L2A_STARTED", "started", { pmid: PMID });
    steps.push({ stage: "preflight", status: "passed" });

    const search = await executeAdHocSearch({
      principal: actor,
      criteria: {
        executionPurpose: "TEST_VALIDATION",
        pmid: PMID,
        product: "Paracetamol",
        sourceKeys: ["PUBMED"],
        limit: 1,
      },
    });
    const target =
      search.results.find((result) => result.pmid === PMID) ?? search.results[0];
    if (!target) {
      throw new Error(`Controlled PubMed test article PMID ${PMID} was not returned.`);
    }

    await pool.query(
      `UPDATE ad_hoc_literature_results
          SET match_metadata = match_metadata || $3::jsonb
        WHERE tenant_id = $1
          AND id = $2`,
      [
        TENANT_ID,
        target.id,
        JSON.stringify({
          country: "India",
          countryOfInterest: "India",
          validationFixture: true,
          validationTestId: TEST_ID,
          validationBasis:
            "Controlled production E2E fixture; country scope fixed to Product Master market for deterministic workflow validation.",
        }),
      ],
    );
    await recordEvent("PRODUCTION_E2E_FIXTURE_SCOPED", "success", {
      searchId: search.searchId,
      resultId: target.id,
      pmid: target.pmid,
      countryOfInterest: "India",
    });
    steps.push({ stage: "literature-search", status: search.status, searchId: search.searchId, resultId: target.id });

    const hitsRun = await executeProductionSearchToHits({
      principal: actor,
      resultIds: [target.id],
    });
    const hitPackage = hitsRun.packages[0];
    if (!hitPackage || hitPackage.status === "failed") {
      throw new Error(
        `Hits execution failed: ${hitPackage && "error" in hitPackage ? String(hitPackage.error) : "unknown error"}`,
      );
    }
    const packageId = hitPackage.packageId;
    const latestHits = await pool.query<{ id: string; result_payload: Record<string, unknown> }>(
      `SELECT id, result_payload
         FROM hits_results
        WHERE tenant_id = $1 AND package_id = $2
        ORDER BY result_version DESC, created_at DESC
        LIMIT 1`,
      [TENANT_ID, packageId],
    );
    if (!latestHits.rows[0]) throw new Error("No persisted Hits result was found.");
    const hitResult = asRecord(asRecord(latestHits.rows[0].result_payload).result);
    const hitCompanyAssessments = Array.isArray(hitResult.companySuspectAssessments)
      ? hitResult.companySuspectAssessments.filter((item) => item && typeof item === "object")
      : [];
    if (
      !hitCompanyAssessments.some((item) => {
        const assessment = asRecord(item);
        return assessment.companySuspect === true && assessment.licenceStatus === "ACTIVE";
      })
    ) {
      throw new Error("Hits did not confirm an active company product/MAH for the controlled fixture.");
    }

    await saveHitsReview({
      principal: actor,
      review: {
        packageId,
        hitsResultId: latestHits.rows[0].id,
        status: "approved",
        comments: `Controlled production E2E validation ${TEST_ID}: governed Hit accepted for downstream screening.`,
      },
    });
    steps.push({ stage: "hits", status: "passed", packageId, hitsResultId: latestHits.rows[0].id });

    const screening = await executeScreening({
      principal: actor,
      request: {
        packageId,
        reason: `Controlled production E2E validation ${TEST_ID}: execute literature screening.`,
      },
    });
    if (!screening.screeningResultId) {
      throw new Error("Screening execution did not persist a screening result.");
    }
    const confirmedProduct = screening.companySuspectAssessments?.find(
      (assessment) =>
        assessment.companySuspect === true &&
        assessment.licenceStatus === "ACTIVE" &&
        assessment.conclusion === "CONFIRMED" &&
        assessment.manualReviewRequired === false,
    );
    if (!confirmedProduct) {
      throw new Error("Screening did not confirm an active company product/MAH for the controlled fixture.");
    }

    await saveScreeningReview({
      principal: actor,
      review: {
        packageId,
        screeningResultId: screening.screeningResultId,
        status: "approved",
        finalDecision: "INCLUDE",
        comments: `Controlled production E2E validation ${TEST_ID}: human-review fixture confirms inclusion.`,
      },
    });

    const reviewWorkspace = await pool.query<{ id: string }>(
      `SELECT id
         FROM literature_review_workspaces
        WHERE tenant_id = $1
          AND package_id = $2
          AND screening_result_id = $3
        LIMIT 1`,
      [TENANT_ID, packageId, screening.screeningResultId],
    );
    const reviewWorkspaceId = reviewWorkspace.rows[0]?.id;
    if (!reviewWorkspaceId) throw new Error("Medical Review workspace was not created.");

    const regulatoryEvidence = asRecord(screening.regulatoryEvidence);
    const clinicalEvents = Array.isArray(regulatoryEvidence.clinicalEvents)
      ? regulatoryEvidence.clinicalEvents
      : [];
    const firstEvent = asRecord(clinicalEvents[0]);
    const event =
      text(firstEvent.event) ||
      screening.upstreamHitsDetectedEvents?.[0] ||
      "Drug-induced hepatic injury";
    const product = confirmedProduct.reportedProduct;

    await savePatientSegmentation({
      principal: actor,
      workspaceId: reviewWorkspaceId,
      patients: [
        {
          patientSegmentKey: "P1",
          patientLabel: "Controlled E2E literature patient",
          identifiablePatientStatus: "PRESENT",
          country: "India",
          evidence: "Controlled validation fixture based on the governed literature evidence package.",
          products: [product],
          events: [event],
        },
      ],
      reason: `Controlled production E2E validation ${TEST_ID}: save governed patient segmentation.`,
    });
    await saveLabelAssessments({
      principal: actor,
      workspaceId: reviewWorkspaceId,
      assessments: [
        {
          patientSegmentKey: "P1",
          reportedProduct: product,
          clinicalEvent: event,
          conclusion: "UNRESOLVED",
          rationale: "Expectedness intentionally remains unresolved in this controlled E2E transport validation.",
        },
      ],
      reason: `Controlled production E2E validation ${TEST_ID}: record expectedness as unresolved without inventing a label conclusion.`,
    });
    await saveCausalityAssessments({
      principal: actor,
      workspaceId: reviewWorkspaceId,
      assessments: [
        {
          patientSegmentKey: "P1",
          reportedProduct: product,
          clinicalEvent: event,
          conclusion: "UNRESOLVED",
          rationale: "Causality intentionally remains unresolved in this controlled E2E transport validation.",
        },
      ],
      reason: `Controlled production E2E validation ${TEST_ID}: record causality as unresolved without inventing a clinical conclusion.`,
    });
    await saveMedicalReview({
      principal: actor,
      workspaceId: reviewWorkspaceId,
      status: "APPROVED",
      finalDecision: "INCLUDE_FOR_INTAKE",
      comments: "Controlled production E2E validation fixture approved for downstream workflow transport; no real clinical conclusion is asserted.",
      reason: `Controlled production E2E validation ${TEST_ID}: approve the validation fixture for intake handoff.`,
    });
    steps.push({ stage: "screening-medical-review", status: "passed", screeningResultId: screening.screeningResultId, reviewWorkspaceId });

    const intakeExport = await generateIntakeInput({
      principal: actor,
      request: {
        packageId,
        reason: `Controlled production E2E validation ${TEST_ID}: generate immutable Literature-to-Intake handoff.`,
      },
    });
    const imported = await importLiteratureIntakeExport({
      principal: actor,
      exportId: intakeExport.exportId,
      reason: `Controlled production E2E validation ${TEST_ID}: import governed Literature handoff into Intake.`,
    });
    const intakeRecordId = imported.intakeRecordId;

    await completeIntakeSourceReview({
      principal: actor,
      intakeRecordId,
      reason: `Controlled production E2E validation ${TEST_ID}: verify structured literature source review.`,
    });
    steps.push({ stage: "intake-import", status: "passed", exportId: intakeExport.exportId, intakeRecordId });

    const triage = await getTriageWorkspace({ principal: actor, intakeRecordId });
    const allCriteriaMet = triage.systemSnapshot.criteria.every(
      (criterion) => criterion.status === "MET",
    );
    if (!allCriteriaMet) {
      throw new Error(
        `Triage minimum criteria are not all MET: ${triage.systemSnapshot.criteria
          .map((criterion) => `${criterion.key}=${criterion.status}`)
          .join(", ")}`,
      );
    }

    const seriousnessCriteria = Object.fromEntries(
      Object.entries(triage.systemSnapshot.seriousnessEvidence).map(
        ([key, evidence]) => [key, Array.isArray(evidence) && evidence.length > 0],
      ),
    );
    const recommendedSeriousness =
      triage.systemSnapshot.seriousnessRecommendation === "UNRESOLVED"
        ? "NON_SERIOUS"
        : triage.systemSnapshot.seriousnessRecommendation;

    await finalizeTriageAssessment({
      principal: actor,
      intakeRecordId,
      decision: {
        minimumCriteria: triage.systemSnapshot.criteria.map((criterion) => ({
          ...criterion,
          reason: criterion.reason || "Controlled E2E human-validation fixture confirms the available governed evidence.",
        })),
        humanValidityDecision: "VALID",
        seriousnessStatus: recommendedSeriousness,
        seriousnessCriteria:
          recommendedSeriousness === "SERIOUS"
            ? seriousnessCriteria
            : {},
        specialSituations: triage.systemSnapshot.detectedSpecialSituations,
        priority: triage.systemSnapshot.priorityRecommendation,
        followUpRequired: triage.systemSnapshot.followUpRecommended,
        followUpReasons: triage.systemSnapshot.followUpReasons,
        rationale: "All four minimum ICSR criteria are present in the controlled literature validation fixture.",
      },
    });

    const duplicate = await runDuplicateSearch({
      principal: actor,
      intakeRecordId,
      reason: `Controlled production E2E validation ${TEST_ID}: execute duplicate and follow-up search before L2A.`,
    });
    const topScore = duplicate.candidates[0]?.score ?? 0;
    if (topScore >= 50) {
      throw new Error(
        `Duplicate engine returned a potential match with score ${topScore}; human duplicate review is required before L2A.`,
      );
    }
    await finalizeDuplicateReview({
      principal: actor,
      intakeRecordId,
      humanDecision: "NEW_CASE",
      rationale: "Controlled E2E duplicate review found no likely prior case match; proceed as a new validation case.",
    });
    steps.push({ stage: "triage-duplicate", status: "passed", topDuplicateScore: topScore });

    const disposition = await finalizeIntakeDisposition({
      principal: actor,
      intakeRecordId,
      request: {
        dispositionType: "CREATE_NEXUS_CASE",
        rationale: `Controlled production E2E validation ${TEST_ID}: create Nexus L2A case after completed triage and duplicate review.`,
        metadata: { validationTestId: TEST_ID, validationFixture: true },
      },
    });
    if (!disposition.createdCase) {
      throw new Error("L2A disposition completed without creating a Case Processing record.");
    }

    const result = {
      testId: TEST_ID,
      pmid: PMID,
      packageId,
      screeningResultId: screening.screeningResultId,
      reviewWorkspaceId,
      intakeExportId: intakeExport.exportId,
      intakeRecordId,
      caseId: disposition.createdCase.caseId,
      caseKey: disposition.createdCase.caseKey,
      caseStatus: disposition.createdCase.caseStatus,
      workspaceId: WORKSPACE_ID,
      environment: "PROD",
      steps,
    };
    await recordEvent("PRODUCTION_E2E_HITS_TO_L2A_COMPLETED", "success", result);
    return Response.json({ success: true, reused: false, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown production E2E failure.";
    await recordEvent("PRODUCTION_E2E_HITS_TO_L2A_FAILED", "failure", {
      pmid: PMID,
      error: message,
      steps,
    }).catch(() => undefined);
    return Response.json(
      { success: false, testId: TEST_ID, error: message, steps },
      { status: 500 },
    );
  }
}
