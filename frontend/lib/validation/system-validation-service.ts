import "server-only";

import { randomUUID } from "node:crypto";

import { canonicalJson } from "@/lib/enterprise/canonical-json";
import { sha256Text } from "@/lib/enterprise/reliability-governance";
import { getRuntimeConfig } from "@/lib/enterprise/environment";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import {
  SYSTEM_VALIDATION_CONTROLS,
  automatedPackageStatus,
  type ValidationCheckStatus,
} from "@/lib/validation/system-validation-governance";

interface ValidationCheck {
  id: string;
  category: string;
  requirement: string;
  automated: boolean;
  status: ValidationCheckStatus;
  evidence: Record<string, unknown>;
  evidencePaths: string[];
}

function configCountMap(
  rows: Array<{ resource_type: string; active_count: string }>,
): Map<string, number> {
  return new Map(
    rows.map((row) => [row.resource_type, Number(row.active_count || 0)]),
  );
}

async function collectChecks(
  tenantId: string,
): Promise<ValidationCheck[]> {
  const pool = getPostgresPool();

  const [
    tables,
    configs,
    auditCount,
    criticalFindings,
    sprint6c,
    intakeIntegrity,
    scheduledRuns,
  ] = await Promise.all([
    pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name = ANY($1::text[])`,
      [[
        "literature_packages",
        "literature_workflow_state",
        "hits_results",
        "screening_results",
        "literature_review_workspaces",
        "intake_input_exports",
        "literature_intake_case_candidates",
        "reliability_findings",
        "literature_scheduled_search_runs",
      ]],
    ),
    pool.query<{ resource_type: string; active_count: string }>(
      `SELECT set.resource_type, count(*)::text AS active_count
       FROM tenant_configuration_versions version
       JOIN tenant_configuration_sets set ON set.id=version.config_set_id
       WHERE version.tenant_id=$1
         AND version.lifecycle_status='active'
         AND set.resource_type IN (
           'PRODUCT_MASTER','SEARCH_PROFILE','LITERATURE_CALENDAR',
           'LABEL_REFERENCE','CAUSALITY_METHOD'
         )
       GROUP BY set.resource_type`,
      [tenantId],
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE tenant_id=$1`,
      [tenantId],
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM reliability_findings
       WHERE tenant_id=$1 AND status <> 'RESOLVED' AND severity='CRITICAL'`,
      [tenantId],
    ),
    pool.query<{ count: string; latest_at: string | null }>(
      `SELECT count(*)::text AS count, max(occurred_at)::text AS latest_at
       FROM audit_events
       WHERE tenant_id=$1
         AND event_type='SPRINT_6C_AUTONOMOUS_VALIDATION_PASSED'
         AND outcome='success'`,
      [tenantId],
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM reliability_findings
       WHERE tenant_id=$1
         AND status <> 'RESOLVED'
         AND finding_type='INTAKE_INTEGRITY'`,
      [tenantId],
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM literature_scheduled_search_runs
       WHERE tenant_id=$1`,
      [tenantId],
    ),
  ]);

  const existingTables = new Set(tables.rows.map((row) => row.table_name));
  const cfg = configCountMap(configs.rows);
  const requiredWorkflowTables = [
    "literature_packages",
    "literature_workflow_state",
    "hits_results",
    "screening_results",
    "literature_review_workspaces",
    "intake_input_exports",
  ];
  const architecturePass = requiredWorkflowTables.every((table) =>
    existingTables.has(table),
  );

  const byId = new Map<string, { status: ValidationCheckStatus; evidence: Record<string, unknown> }>([
    [
      "VAL-ARCH-001",
      {
        status: architecturePass ? "PASS" : "FAIL",
        evidence: {
          requiredTables: requiredWorkflowTables,
          presentTables: [...existingTables].sort(),
        },
      },
    ],
    [
      "VAL-CFG-001",
      {
        status: (cfg.get("PRODUCT_MASTER") || 0) > 0 ? "PASS" : "FAIL",
        evidence: { activeProductMasterVersions: cfg.get("PRODUCT_MASTER") || 0 },
      },
    ],
    [
      "VAL-CFG-002",
      {
        status:
          (cfg.get("LABEL_REFERENCE") || 0) > 0 &&
          (cfg.get("CAUSALITY_METHOD") || 0) > 0
            ? "PASS"
            : "FAIL",
        evidence: {
          activeLabelReferenceVersions: cfg.get("LABEL_REFERENCE") || 0,
          activeCausalityMethodVersions: cfg.get("CAUSALITY_METHOD") || 0,
        },
      },
    ],
    [
      "VAL-SCHED-001",
      {
        status:
          (cfg.get("SEARCH_PROFILE") || 0) > 0 &&
          (cfg.get("LITERATURE_CALENDAR") || 0) > 0
            ? "PASS"
            : "FAIL",
        evidence: {
          activeSearchProfileVersions: cfg.get("SEARCH_PROFILE") || 0,
          activeLiteratureCalendarVersions: cfg.get("LITERATURE_CALENDAR") || 0,
          scheduledRunCount: Number(scheduledRuns.rows[0]?.count || 0),
        },
      },
    ],
    [
      "VAL-AUDIT-001",
      {
        status: Number(auditCount.rows[0]?.count || 0) > 0 ? "PASS" : "FAIL",
        evidence: { tenantAuditEventCount: Number(auditCount.rows[0]?.count || 0) },
      },
    ],
    [
      "VAL-INTAKE-001",
      {
        status:
          existingTables.has("literature_intake_case_candidates") &&
          Number(intakeIntegrity.rows[0]?.count || 0) === 0
            ? "PASS"
            : "FAIL",
        evidence: {
          caseCandidateLedgerPresent: existingTables.has(
            "literature_intake_case_candidates",
          ),
          openIntakeIntegrityFindings: Number(
            intakeIntegrity.rows[0]?.count || 0,
          ),
        },
      },
    ],
    [
      "VAL-REL-001",
      {
        status:
          Number(criticalFindings.rows[0]?.count || 0) === 0
            ? "PASS"
            : "FAIL",
        evidence: {
          openCriticalReliabilityFindings: Number(
            criticalFindings.rows[0]?.count || 0,
          ),
        },
      },
    ],
    [
      "VAL-E2E-001",
      {
        status: Number(sprint6c.rows[0]?.count || 0) > 0 ? "PASS" : "FAIL",
        evidence: {
          successfulSprint6cRuns: Number(sprint6c.rows[0]?.count || 0),
          latestSuccessfulSprint6cAt: sprint6c.rows[0]?.latest_at || null,
        },
      },
    ],
    [
      "VAL-CI-001",
      {
        status: "MANUAL_REQUIRED",
        evidence: {
          instruction:
            "Attach the GitHub Actions run URL / artifact for the exact build SHA and verify every mandatory job passed.",
        },
      },
    ],
    [
      "VAL-IQ-001",
      {
        status: "MANUAL_REQUIRED",
        evidence: {
          protocol: "docs/validation/IQ-OQ-PQ-PROTOCOL.md",
          phase: "IQ",
        },
      },
    ],
    [
      "VAL-OQ-001",
      {
        status: "MANUAL_REQUIRED",
        evidence: {
          protocol: "docs/validation/IQ-OQ-PQ-PROTOCOL.md",
          phase: "OQ",
        },
      },
    ],
    [
      "VAL-PQ-001",
      {
        status: "MANUAL_REQUIRED",
        evidence: {
          protocol: "docs/validation/IQ-OQ-PQ-PROTOCOL.md",
          phase: "PQ/UAT",
        },
      },
    ],
  ]);

  return SYSTEM_VALIDATION_CONTROLS.map((control) => {
    const result = byId.get(control.id) || {
      status: "NOT_EXECUTED" as ValidationCheckStatus,
      evidence: {},
    };
    return {
      ...control,
      status: result.status,
      evidence: result.evidence,
    };
  });
}

export async function generateSystemValidationPackage(input: {
  principal: RequestPrincipal;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 8) {
    throw new Error("A specific validation-package generation reason is required.");
  }

  const runtime = getRuntimeConfig();
  const checks = await collectChecks(input.principal.tenantId);
  const status = automatedPackageStatus(checks);
  const buildSha = runtime.buildSha || "unknown";
  const releaseVersion = runtime.appVersion || "unversioned";
  const generatedAt = new Date().toISOString();
  const validationKey =
    `SYSVAL-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${buildSha.slice(0, 8)}-${randomUUID().slice(0, 8)}`;

  const payload = {
    schemaVersion: "clinixai.system-validation.v1",
    validationKey,
    scope: "LITERATURE_SCREENING_PRODUCTION",
    generatedAt,
    build: {
      buildSha,
      releaseVersion,
      environment: runtime.environment,
      region: runtime.region,
    },
    automatedSummary: {
      passed: checks.filter((check) => check.status === "PASS").length,
      failed: checks.filter((check) => check.status === "FAIL").length,
      manualRequired: checks.filter(
        (check) => check.status === "MANUAL_REQUIRED",
      ).length,
      notExecuted: checks.filter((check) => check.status === "NOT_EXECUTED")
        .length,
      status,
    },
    controls: checks,
    requiredSignoffs: [
      "VALIDATION_OWNER",
      "QUALITY_APPROVER",
      "RELEASE_APPROVER",
    ],
    qualificationBoundary: {
      systemGeneratedPackageIsApproval: false,
      humanExecutionRequiredForIQOQPQUAT: true,
      productionReleaseBlockedByAutomatedFailures: true,
    },
    generationReason: reason,
  };
  const content = canonicalJson(payload);
  const contentSha256 = sha256Text(content);

  const result = await getPostgresPool().query<{
    id: string;
    validation_key: string;
    package_version: number;
    status: string;
    build_sha: string;
    release_version: string;
    content_sha256: string;
    generated_at: string;
  }>(
    `INSERT INTO system_validation_packages (
       tenant_id, validation_key, package_version, scope, build_sha,
       release_version, status, payload, content_sha256, generated_by
     ) VALUES ($1,$2,1,'LITERATURE_SCREENING_PRODUCTION',$3,$4,$5,$6::jsonb,$7,$8)
     RETURNING id, validation_key, package_version, status, build_sha,
               release_version, content_sha256, generated_at::text`,
    [
      input.principal.tenantId,
      validationKey,
      buildSha,
      releaseVersion,
      status,
      JSON.stringify(payload),
      contentSha256,
      input.principal.userId,
    ],
  );

  await getPostgresPool().query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome, details
     ) VALUES ($1,$2,'SYSTEM_VALIDATION_PACKAGE_GENERATED',
       'VALIDATION_RELEASE',$3,$4::jsonb)`,
    [
      input.principal.tenantId,
      input.principal.userId,
      status === "BLOCKED" ? "warning" : "success",
      JSON.stringify({
        validationPackageId: result.rows[0].id,
        validationKey,
        status,
        buildSha,
        contentSha256,
        failedAutomatedControls: checks
          .filter((check) => check.automated && check.status === "FAIL")
          .map((check) => check.id),
        reason,
      }),
    ],
  );

  return { ...result.rows[0], payload };
}

export async function listSystemValidationPackages(input: {
  tenantId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit || 50, 200));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT package.id, package.validation_key, package.package_version,
            package.scope, package.build_sha, package.release_version,
            package.status, package.content_sha256,
            package.generated_at::text AS generated_at,
            generator.display_name AS generated_by,
            COALESCE(signoffs.records, '[]'::jsonb) AS signoffs
     FROM system_validation_packages package
     LEFT JOIN application_users generator ON generator.id=package.generated_by
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
         'signoffRole', signoff.signoff_role,
         'decision', signoff.decision,
         'comments', signoff.comments,
         'signedAt', signoff.signed_at,
         'signedBy', signer.display_name
       ) ORDER BY signoff.signoff_role) AS records
       FROM system_validation_signoffs signoff
       JOIN application_users signer ON signer.id=signoff.signed_by
       WHERE signoff.tenant_id=package.tenant_id
         AND signoff.validation_package_id=package.id
     ) signoffs ON true
     WHERE package.tenant_id=$1
     ORDER BY package.generated_at DESC
     LIMIT $2`,
    [input.tenantId, limit],
  );
  return result.rows;
}

export async function getSystemValidationPackage(input: {
  tenantId: string;
  id: string;
}) {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT package.*, generator.display_name AS generated_by,
            COALESCE(signoffs.records, '[]'::jsonb) AS signoffs
     FROM system_validation_packages package
     LEFT JOIN application_users generator ON generator.id=package.generated_by
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
         'signoffRole', signoff.signoff_role,
         'decision', signoff.decision,
         'comments', signoff.comments,
         'signedAt', signoff.signed_at,
         'signedBy', signer.display_name
       ) ORDER BY signoff.signoff_role) AS records
       FROM system_validation_signoffs signoff
       JOIN application_users signer ON signer.id=signoff.signed_by
       WHERE signoff.tenant_id=package.tenant_id
         AND signoff.validation_package_id=package.id
     ) signoffs ON true
     WHERE package.tenant_id=$1 AND package.id=$2
     LIMIT 1`,
    [input.tenantId, input.id],
  );
  if (!result.rows[0]) {
    throw new Error("System validation package was not found.");
  }
  return result.rows[0];
}

function assertSignoffRole(
  principal: RequestPrincipal,
  signoffRole: string,
): void {
  const allowed: Record<string, string[]> = {
    VALIDATION_OWNER: [
      "CLINIXAI_SUPER_ADMIN",
      "CLIENT_OWNER",
      "PV_ADMINISTRATOR",
    ],
    QUALITY_APPROVER: ["CLINIXAI_SUPER_ADMIN", "QUALITY_APPROVER"],
    RELEASE_APPROVER: ["CLINIXAI_SUPER_ADMIN", "CLIENT_OWNER"],
  };

  if (!(allowed[signoffRole] || []).includes(principal.roleKey)) {
    throw new Error(
      `Role ${principal.roleKey} is not authorized for ${signoffRole} sign-off.`,
    );
  }
}

export async function recordSystemValidationSignoff(input: {
  principal: RequestPrincipal;
  validationPackageId: string;
  signoffRole: "VALIDATION_OWNER" | "QUALITY_APPROVER" | "RELEASE_APPROVER";
  decision: "APPROVED" | "REJECTED";
  comments: string;
}) {
  assertSignoffRole(input.principal, input.signoffRole);
  if (input.comments.trim().length < 8) {
    throw new Error("A specific validation sign-off comment is required.");
  }

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{
      status: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT status, payload
       FROM system_validation_packages
       WHERE tenant_id=$1 AND id=$2
       FOR UPDATE`,
      [input.principal.tenantId, input.validationPackageId],
    );
    const pkg = selected.rows[0];
    if (!pkg) throw new Error("System validation package was not found.");
    if (pkg.status === "APPROVED" || pkg.status === "REJECTED") {
      throw new Error("Finalized validation package cannot be edited.");
    }
    if (pkg.status === "BLOCKED" && input.decision === "APPROVED") {
      throw new Error(
        "A BLOCKED validation package cannot receive an approval sign-off. Regenerate after automated failures are cleared.",
      );
    }

    await client.query(
      `INSERT INTO system_validation_signoffs (
         tenant_id, validation_package_id, signoff_role, decision,
         comments, signed_by
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, validation_package_id, signoff_role)
       DO UPDATE SET
         decision=EXCLUDED.decision,
         comments=EXCLUDED.comments,
         signed_by=EXCLUDED.signed_by,
         signed_at=now()`,
      [
        input.principal.tenantId,
        input.validationPackageId,
        input.signoffRole,
        input.decision,
        input.comments.trim(),
        input.principal.userId,
      ],
    );

    const decisions = await client.query<{
      signoff_role: string;
      decision: string;
    }>(
      `SELECT signoff_role, decision
       FROM system_validation_signoffs
       WHERE tenant_id=$1 AND validation_package_id=$2`,
      [input.principal.tenantId, input.validationPackageId],
    );

    const map = new Map(
      decisions.rows.map((row) => [row.signoff_role, row.decision]),
    );
    const nextStatus = [...map.values()].includes("REJECTED")
      ? "REJECTED"
      : ["VALIDATION_OWNER", "QUALITY_APPROVER", "RELEASE_APPROVER"].every(
            (role) => map.get(role) === "APPROVED",
          )
        ? "APPROVED"
        : "READY_FOR_QA_REVIEW";

    await client.query(
      `UPDATE system_validation_packages
       SET status=$3, updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [input.principal.tenantId, input.validationPackageId, nextStatus],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SYSTEM_VALIDATION_SIGNOFF_RECORDED',
         'VALIDATION_RELEASE',$3,$4::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        input.decision === "APPROVED" ? "success" : "failure",
        JSON.stringify({
          validationPackageId: input.validationPackageId,
          signoffRole: input.signoffRole,
          decision: input.decision,
          resultingStatus: nextStatus,
          comments: input.comments.trim(),
        }),
      ],
    );

    await client.query("COMMIT");
    return getSystemValidationPackage({
      tenantId: input.principal.tenantId,
      id: input.validationPackageId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
