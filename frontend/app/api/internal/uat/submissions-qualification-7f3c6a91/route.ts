import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import {
  runSubmissionPreflight,
  transmitSubmission,
} from "@/lib/submissions/submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET = {
  database: "literature_screening_prod",
  project: "old-mountain-48148190",
  branch: "br-muddy-tooth-b3186ol1",
};

const FIXTURE = {
  tenantId: "a40a0000-0000-4000-8000-000000000001",
  workspaceId: "a40a0000-0000-4000-8000-000000000002",
  userId: "a40a0000-0000-4000-8000-000000000003",
  submissionId: "a40a0000-0000-4000-8000-000000000007",
};

export async function GET(): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not Found", { status: 404 });
  }

  const db = getPostgresPool();
  const fingerprint = await db.query<{
    database: string;
    project: string | null;
    branch: string | null;
  }>(`SELECT current_database() AS database,
             current_setting('neon.project_id', true) AS project,
             current_setting('neon.branch_id', true) AS branch`);
  const actual = fingerprint.rows[0];
  if (
    actual.database !== TARGET.database ||
    actual.project !== TARGET.project ||
    actual.branch !== TARGET.branch
  ) {
    return Response.json({ success: false, error: "Database target guard rejected runtime." }, { status: 409 });
  }

  const principal = {
    tenantId: FIXTURE.tenantId,
    tenantKey: "nexus-submissions-qualification",
    workspaceId: FIXTURE.workspaceId,
    environment: "UAT",
    userId: FIXTURE.userId,
    email: "submissions.qualification@invalid.example",
    displayName: "Submissions Qualification Runner",
    roleKey: "CLINIXAI_SUPER_ADMIN",
    customPermissions: [],
    hasPermission: () => true,
  } as RequestPrincipal & { workspaceId: string };

  const preflight = await runSubmissionPreflight({
    principal,
    submissionId: FIXTURE.submissionId,
  });

  let transmissionBlocked = false;
  let transmissionMessage = "";
  try {
    await transmitSubmission({ principal, submissionId: FIXTURE.submissionId });
  } catch (error) {
    transmissionMessage = error instanceof Error ? error.message : String(error);
    transmissionBlocked = transmissionMessage.includes("disabled pending authority onboarding");
  }

  const evidence = await db.query<{
    preflight_rows: number;
    blocked_audit_rows: number;
    schema_tables: number;
  }>(`SELECT
      (SELECT count(*)::int FROM nexus_submission_preflight_runs
        WHERE tenant_id=$1 AND workspace_id=$2 AND environment='UAT'
          AND submission_package_id=$3) AS preflight_rows,
      (SELECT count(*)::int FROM audit_events
        WHERE tenant_id=$1 AND workspace_id=$2 AND environment='UAT'
          AND event_type='SUBMISSION_TRANSMISSION_BLOCKED_BY_CONFIGURATION'
          AND details->>'submissionId'=$3::text) AS blocked_audit_rows,
      (SELECT count(*)::int FROM information_schema.tables
        WHERE table_schema='public' AND table_name IN
          ('safety_cases','nexus_submission_packages','nexus_submission_preflight_runs','nexus_submission_outbox')) AS schema_tables`,
    [FIXTURE.tenantId, FIXTURE.workspaceId, FIXTURE.submissionId],
  );

  return Response.json({
    success:
      evidence.rows[0].schema_tables === 4 &&
      evidence.rows[0].preflight_rows > 0 &&
      evidence.rows[0].blocked_audit_rows > 0 &&
      transmissionBlocked,
    target: actual,
    submissionId: FIXTURE.submissionId,
    preflight: {
      id: preflight.id,
      readiness: preflight.readiness,
      reportSha256: preflight.report_sha256,
    },
    transmission: {
      blocked: transmissionBlocked,
      reason: transmissionMessage,
    },
    persistence: evidence.rows[0],
  });
}
