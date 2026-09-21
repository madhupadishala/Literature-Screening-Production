import "server-only";

import { randomUUID } from "node:crypto";

import {
  createConfigurationVersion,
  listConfigurationVersions,
  transitionConfigurationVersion,
} from "@/lib/configuration/repository";
import type {
  ConfigurationResourceType,
  ConfigurationVersionRecord,
} from "@/lib/configuration/types";
import { resolveActiveConfigurations } from "@/lib/configuration/active-resolver";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  createValidationPackagesFromSearch,
  linkValidationPackagesToHits,
} from "@/lib/literature/adhoc-search/validation-package-service";
import { executeProductionSearchToHits } from "@/lib/literature/hits/production-search-to-hits-service";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

const FIXTURE_KEY = "SPRINT_6C_POSITIVE_PARACETAMOL_URTICARIA_V1";
const LABEL_CONFIG_KEY = "validation-sprint6c-paracetamol-label";
const CAUSALITY_CONFIG_KEY = "validation-sprint6c-causality";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload) && Array.isArray(payload.records)) {
    return payload.records.filter(isRecord);
  }
  return [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function ensureProductMasterSupportsFixture(tenantId: string): Promise<void> {
  const active = await resolveActiveConfigurations(tenantId);
  if (!active.productMaster) {
    throw new Error("Sprint 6C fixture requires an active Product Master.");
  }

  const product = recordsFromPayload(active.productMaster.payload).find(
    (record) =>
      text(record.clientProductId || record.productId) === "DEMO-PROD-001" &&
      ["paracetamol", "acetaminophen"].includes(
        text(record.genericName || record.inn || record.api).toLowerCase(),
      ) &&
      text(record.country || record.market).toLowerCase() === "india" &&
      ["true", "yes", "1", "active"].includes(
        String(record.active ?? record.authorizationActive ?? "")
          .trim()
          .toLowerCase(),
      ),
  );

  if (!product) {
    throw new Error(
      "Sprint 6C fixture requires active DEMO-PROD-001 Paracetamol licensed in India.",
    );
  }
}

async function ensureActiveValidationConfiguration(input: {
  principal: RequestPrincipal;
  resourceType: ConfigurationResourceType;
  configKey: string;
  displayName: string;
  description: string;
  payload: Record<string, unknown>;
}): Promise<ConfigurationVersionRecord> {
  const versions = await listConfigurationVersions({
    principal: input.principal,
    resourceType: input.resourceType,
    limit: 500,
  });

  const active = versions.find(
    (version) =>
      version.configKey === input.configKey &&
      version.lifecycleStatus === "active",
  );
  if (active) return active;

  const version = await createConfigurationVersion({
    principal: input.principal,
    resourceType: input.resourceType,
    configKey: input.configKey,
    displayName: input.displayName,
    description: input.description,
    versionLabel: "s6c-" + new Date().toISOString().replace(/[:.]/g, "-"),
    payload: input.payload,
    changeReason:
      "Create synthetic VALIDATION_ONLY configuration for Sprint 6C controlled positive end-to-end verification.",
  });

  const validated = await transitionConfigurationVersion({
    principal: input.principal,
    versionId: version.id,
    action: "VALIDATE",
    reason: "Validate Sprint 6C synthetic validation-only fixture configuration.",
  });
  const approved = await transitionConfigurationVersion({
    principal: input.principal,
    versionId: validated.id,
    action: "APPROVE",
    reason: "Approve Sprint 6C synthetic validation-only fixture configuration.",
  });
  return transitionConfigurationVersion({
    principal: input.principal,
    versionId: approved.id,
    action: "ACTIVATE",
    reason: "Activate Sprint 6C synthetic validation-only fixture configuration.",
  });
}

async function ensureValidationReferences(principal: RequestPrincipal): Promise<{
  labelVersionId: string;
  causalityVersionId: string;
}> {
  const label = await ensureActiveValidationConfiguration({
    principal,
    resourceType: "LABEL_REFERENCE",
    configKey: LABEL_CONFIG_KEY,
    displayName: "Sprint 6C Validation Label / RSI",
    description:
      "Synthetic validation-only expectedness reference. Never eligible for production Review decisions.",
    payload: {
      usageScope: "VALIDATION_ONLY",
      records: [
        {
          usageScope: "VALIDATION_ONLY",
          labelKey: "VAL-DEMO-PROD-001-IN-CCSI",
          clientProductId: "DEMO-PROD-001",
          country: "India",
          labelType: "CCSI",
          version: "VAL-1.0",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          eventTerms: ["Urticaria"],
          sourceDocument: "Synthetic Sprint 6C validation fixture reference",
        },
      ],
    },
  });

  const causality = await ensureActiveValidationConfiguration({
    principal,
    resourceType: "CAUSALITY_METHOD",
    configKey: CAUSALITY_CONFIG_KEY,
    displayName: "Sprint 6C Validation Causality Method",
    description:
      "Synthetic validation-only causality method. Never eligible for production Review decisions.",
    payload: {
      usageScope: "VALIDATION_ONLY",
      records: [
        {
          usageScope: "VALIDATION_ONLY",
          methodKey: "VAL-STRUCTURED-CLINICAL-JUDGEMENT",
          methodName: "Validation Structured Clinical Judgement",
          version: "VAL-1.0",
          allowedConclusions: [
            "RELATED",
            "POSSIBLY_RELATED",
            "NOT_RELATED",
            "UNRESOLVED",
          ],
          methodology:
            "Validation-only structured review of chronology, dechallenge/rechallenge, alternative causes, concomitants, biological plausibility, and reporter assessment.",
        },
      ],
    },
  });

  return {
    labelVersionId: label.id,
    causalityVersionId: causality.id,
  };
}

export interface Sprint6CFixtureResult {
  fixtureKey: string;
  searchId: string;
  searchKey: string;
  resultId: string;
  validationPackageId: string;
  validationKey: string;
  packageId: string;
  packageKey: string;
  hitsStatus: string;
  workflowState: string;
  labelVersionId: string;
  causalityVersionId: string;
}

export async function createSprint6CPositiveFixture(input: {
  principal: RequestPrincipal;
  reason: string;
}): Promise<Sprint6CFixtureResult> {
  const reason = input.reason.trim();
  if (reason.length < 8) {
    throw new Error("A specific audit reason is required for the validation fixture.");
  }

  await ensureProductMasterSupportsFixture(input.principal.tenantId);
  const references = await ensureValidationReferences(input.principal);

  const now = new Date();
  const runKey = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = randomUUID().slice(0, 8);
  const searchKey = `VALIDATION-S6C-${runKey}-${suffix}`;
  const sourceRecordId = `S6C-${runKey}-${suffix}`;
  const dedupeKey = `validation:s6c:${runKey}:${suffix}`;

  const title =
    "Synthetic validation case: paracetamol-associated urticaria in a patient treated in Hyderabad, India";
  const abstractText =
    "This is a synthetic ClinixAI validation fixture and is not a real publication. " +
    "A 34-year-old female patient was treated at a hospital in Hyderabad, India. " +
    "She received paracetamol 500 mg orally for fever. Two hours after paracetamol administration, " +
    "the patient developed generalized urticaria with pruritic wheals. Paracetamol was withdrawn, " +
    "the patient received antihistamine treatment, and the urticaria resolved. " +
    "The event occurred and was treated in Hyderabad, India. " +
    "The report was authored by Dr Validation Reviewer and describes one identifiable adult patient.";

  const pool = getPostgresPool();
  const client = await pool.connect();
  let searchId = "";
  let resultId = "";

  try {
    await client.query("BEGIN");

    const search = await client.query<{ id: string }>(
      `INSERT INTO ad_hoc_literature_searches (
         search_key, tenant_id, executed_by, criteria, selected_sources,
         translated_queries, status, result_count, selected_count,
         duration_ms, connector_errors, completed_at
       ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,'completed',1,0,0,'{}'::jsonb,now())
       RETURNING id`,
      [
        searchKey,
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          executionPurpose: "TEST_VALIDATION",
          validationFixture: true,
          fixtureKey: FIXTURE_KEY,
          searchString: "Synthetic Sprint 6C positive controlled validation case",
          testOnly: true,
        }),
        JSON.stringify(["VALIDATION_FIXTURE"]),
        JSON.stringify({
          VALIDATION_FIXTURE: "SYNTHETIC_CONTROLLED_POSITIVE_CASE",
        }),
      ],
    );
    searchId = search.rows[0].id;

    const result = await client.query<{ id: string }>(
      `INSERT INTO ad_hoc_literature_results (
         search_id, tenant_id, source_key, source_record_id,
         pmid, doi, title, authors, journal, publication_date,
         language, publication_type, abstract_text, landing_url,
         full_text_status, match_metadata, dedupe_key, selected
       ) VALUES (
         $1,$2,'VALIDATION_FIXTURE',$3,NULL,NULL,$4,$5::jsonb,
         'ClinixAI Validation Fixture',$6,'English','Case Report',$7,NULL,
         'abstract_only',$8::jsonb,$9,false
       )
       RETURNING id`,
      [
        searchId,
        input.principal.tenantId,
        sourceRecordId,
        title,
        JSON.stringify(["Dr Validation Reviewer"]),
        now.toISOString().slice(0, 10),
        abstractText,
        JSON.stringify({
          validationFixture: true,
          fixtureKey: FIXTURE_KEY,
          testOnly: true,
          productName: "Paracetamol",
          preferredName: "Paracetamol",
          genericName: "Paracetamol",
          inn: "Paracetamol",
          clientProductId: "DEMO-PROD-001",
          country: "India",
          countryOfInterest: "India",
          expectedEvent: "Urticaria",
          sourceDisclaimer:
            "Synthetic validation fixture. Not a real literature publication and not eligible for production safety reporting.",
        }),
        dedupeKey,
      ],
    );
    resultId = result.rows[0].id;

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'TEST_SEARCH_EXECUTION_COMPLETED',
         'LITERATURE_SEARCH_TEST','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          searchId,
          searchKey,
          executionPurpose: "TEST_VALIDATION",
          validationFixture: true,
          fixtureKey: FIXTURE_KEY,
          entersPvWorkflow: false,
          resultId,
          reason,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const validationPackages = await createValidationPackagesFromSearch({
    principal: input.principal,
    resultIds: [resultId],
  });
  const validationPackage = validationPackages[0];
  if (!validationPackage) {
    throw new Error("Sprint 6C Validation Package could not be created.");
  }

  const handoff = await executeProductionSearchToHits({
    principal: input.principal,
    resultIds: [resultId],
  });
  const packageResult = handoff.packages[0];
  if (!packageResult || !("packageId" in packageResult)) {
    throw new Error("Sprint 6C fixture could not be promoted to Hits.");
  }

  const linked = await linkValidationPackagesToHits({
    principal: input.principal,
    validationPackages,
  });
  const linkedValidation = linked[0] || validationPackage;

  await pool.query(
    `INSERT INTO audit_events (
       tenant_id, package_id, actor_id, event_type, event_category, outcome, details
     ) VALUES ($1,$2,$3,'SPRINT_6C_POSITIVE_FIXTURE_CREATED',
       'LITERATURE_VALIDATION','success',$4::jsonb)`,
    [
      input.principal.tenantId,
      packageResult.packageId,
      input.principal.userId,
      JSON.stringify({
        fixtureKey: FIXTURE_KEY,
        searchId,
        searchKey,
        resultId,
        packageId: packageResult.packageId,
        packageKey: packageResult.packageKey,
        validationPackageId: linkedValidation.validationPackageId,
        validationKey: linkedValidation.validationKey,
        labelVersionId: references.labelVersionId,
        causalityVersionId: references.causalityVersionId,
        syntheticDataOnly: true,
        humanApprovalsRequired: ["Hits", "Screening", "Patient Segmentation", "Medical Review"],
        reason,
      }),
    ],
  );

  return {
    fixtureKey: FIXTURE_KEY,
    searchId,
    searchKey,
    resultId,
    validationPackageId: linkedValidation.validationPackageId,
    validationKey: linkedValidation.validationKey,
    packageId: packageResult.packageId,
    packageKey: packageResult.packageKey,
    hitsStatus: "status" in packageResult ? String(packageResult.status) : handoff.status,
    workflowState:
      "workflowState" in packageResult
        ? String(packageResult.workflowState)
        : "HITS_REVIEW",
    labelVersionId: references.labelVersionId,
    causalityVersionId: references.causalityVersionId,
  };
}

export async function listSprint6CFixtures(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT
       package.id AS package_id,
       package.package_key,
       package.status,
       package.article_identity,
       package.product_context,
       workflow.workflow_state,
       workflow.state_version,
       workflow.updated_at::text AS workflow_updated_at,
       hits.id AS hits_result_id,
       hits.result_version AS hits_result_version,
       hits_review.review_status AS hits_review_status,
       screening.id AS screening_result_id,
       screening.result_version AS screening_result_version,
       screening_review.review_status AS screening_review_status,
       workspace.id AS review_workspace_id,
       workspace.status AS review_workspace_status,
       workspace.patient_segmentation_status,
       workspace.labeling_status,
       workspace.causality_status,
       workspace.mr_review_status,
       package.created_at::text AS created_at
     FROM literature_packages package
     JOIN literature_workflow_state workflow
       ON workflow.package_id = package.id
      AND workflow.tenant_id = package.tenant_id
     LEFT JOIN LATERAL (
       SELECT id, result_version FROM hits_results
       WHERE tenant_id = package.tenant_id AND package_id = package.id
       ORDER BY result_version DESC, created_at DESC LIMIT 1
     ) hits ON true
     LEFT JOIN hits_reviews hits_review
       ON hits_review.tenant_id = package.tenant_id
      AND hits_review.package_id = package.id
      AND hits_review.hits_result_id = hits.id
     LEFT JOIN LATERAL (
       SELECT id, result_version FROM screening_results
       WHERE tenant_id = package.tenant_id AND package_id = package.id
       ORDER BY result_version DESC, created_at DESC LIMIT 1
     ) screening ON true
     LEFT JOIN screening_reviews screening_review
       ON screening_review.tenant_id = package.tenant_id
      AND screening_review.package_id = package.id
      AND screening_review.screening_result_id = screening.id
     LEFT JOIN literature_review_workspaces workspace
       ON workspace.tenant_id = package.tenant_id
      AND workspace.package_id = package.id
      AND workspace.screening_result_id = screening.id
     WHERE package.tenant_id = $1
       AND package.product_context->>'fixtureKey' = $2
       AND package.product_context->>'validationFixture' = 'true'
     ORDER BY package.created_at DESC
     LIMIT $3`,
    [input.principal.tenantId, FIXTURE_KEY, limit],
  );
  return result.rows;
}
