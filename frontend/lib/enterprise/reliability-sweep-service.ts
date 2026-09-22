import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import {
  classifyAiFailureRate,
  verifyStoredContentHash,
  type ReliabilitySeverity,
} from "@/lib/enterprise/reliability-governance";

type FindingType =
  | "STUCK_WORKFLOW"
  | "STALE_SCHEDULED_RUN"
  | "SCHEDULER_ALERT"
  | "INTAKE_INTEGRITY"
  | "AI_FAILURE_RATE"
  | "CONFIGURATION_GAP";

interface FindingCandidate {
  findingKey: string;
  findingType: FindingType;
  severity: ReliabilitySeverity;
  packageId?: string;
  scheduledRunId?: string;
  summary: string;
  details?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function collectFindings(tenantId: string): Promise<FindingCandidate[]> {
  const pool = getPostgresPool();
  const findings: FindingCandidate[] = [];

  const [stuckWorkflow, staleRuns, schedulerAlerts, intakeExports, aiSummary, configs] =
    await Promise.all([
      pool.query<{
        package_id: string;
        package_key: string;
        workflow_state: string;
        updated_at: string;
        age_hours: number;
      }>(
        `SELECT workflow.package_id, package.package_key, workflow.workflow_state,
                workflow.updated_at::text,
                EXTRACT(EPOCH FROM (now() - workflow.updated_at))/3600 AS age_hours
         FROM literature_workflow_state workflow
         JOIN literature_packages package
           ON package.id=workflow.package_id AND package.tenant_id=workflow.tenant_id
         WHERE workflow.tenant_id=$1
           AND (
             (workflow.workflow_state IN ('HITS_PROCESSING','SCREENING_PROCESSING')
              AND workflow.updated_at < now() - interval '2 hours')
             OR
             (workflow.workflow_state='REVIEW_IN_PROGRESS'
              AND workflow.updated_at < now() - interval '72 hours')
           )`,
        [tenantId],
      ),
      pool.query<{
        id: string;
        schedule_key: string;
        status: string;
        scheduled_for: string;
        updated_at: string;
      }>(
        `SELECT id, schedule_key, status, scheduled_for::text, updated_at::text
         FROM literature_scheduled_search_runs
         WHERE tenant_id=$1
           AND status IN ('QUEUED','RUNNING')
           AND updated_at < now() - interval '2 hours'`,
        [tenantId],
      ),
      pool.query<{
        id: string;
        scheduled_run_id: string | null;
        schedule_key: string;
        alert_type: string;
        severity: ReliabilitySeverity;
        message: string;
        created_at: string;
      }>(
        `SELECT id, scheduled_run_id, schedule_key, alert_type, severity,
                message, created_at::text
         FROM literature_search_schedule_alerts
         WHERE tenant_id=$1 AND status <> 'RESOLVED'
         ORDER BY created_at DESC`,
        [tenantId],
      ),
      pool.query<{
        id: string;
        package_id: string;
        export_version: number;
        schema_version: string;
        content: string;
        sha256: string;
        payload: unknown;
      }>(
        `SELECT id, package_id, export_version, schema_version, content, sha256, payload
         FROM intake_input_exports
         WHERE tenant_id=$1
         ORDER BY generated_at DESC
         LIMIT 200`,
        [tenantId],
      ),
      pool.query<{ executions: string; failures: string }>(
        `SELECT count(*)::text AS executions,
                count(*) FILTER (WHERE status='failed')::text AS failures
         FROM ai_executions
         WHERE tenant_id=$1 AND created_at >= now() - interval '24 hours'`,
        [tenantId],
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
    ]);

  for (const row of stuckWorkflow.rows) {
    findings.push({
      findingKey: `workflow:${row.package_id}:${row.workflow_state}`,
      findingType: "STUCK_WORKFLOW",
      severity: row.workflow_state === "REVIEW_IN_PROGRESS" ? "WARNING" : "CRITICAL",
      packageId: row.package_id,
      summary: `Workflow ${row.package_key} is stale in ${row.workflow_state}.`,
      details: {
        workflowState: row.workflow_state,
        updatedAt: row.updated_at,
        ageHours: Number(row.age_hours),
      },
    });
  }

  for (const row of staleRuns.rows) {
    findings.push({
      findingKey: `scheduled-run:${row.id}:${row.status}`,
      findingType: "STALE_SCHEDULED_RUN",
      severity: "CRITICAL",
      scheduledRunId: row.id,
      summary: `Scheduled search ${row.schedule_key} is stale in ${row.status}.`,
      details: {
        scheduledFor: row.scheduled_for,
        updatedAt: row.updated_at,
      },
    });
  }

  for (const row of schedulerAlerts.rows) {
    findings.push({
      findingKey: `scheduler-alert:${row.id}`,
      findingType: "SCHEDULER_ALERT",
      severity: row.severity,
      scheduledRunId: row.scheduled_run_id || undefined,
      summary: row.message,
      details: {
        scheduleKey: row.schedule_key,
        alertType: row.alert_type,
        createdAt: row.created_at,
      },
    });
  }

  for (const row of intakeExports.rows) {
    if (!verifyStoredContentHash({ content: row.content, expectedSha256: row.sha256 })) {
      findings.push({
        findingKey: `intake-hash:${row.id}`,
        findingType: "INTAKE_INTEGRITY",
        severity: "CRITICAL",
        packageId: row.package_id,
        summary: `Intake export ${row.id} content hash does not match its stored SHA-256.`,
        details: {
          exportVersion: row.export_version,
          schemaVersion: row.schema_version,
        },
      });
      continue;
    }

    if (row.schema_version === "clinixai.literature.intake-input.v2") {
      const payload = isRecord(row.payload) ? row.payload : {};
      const review = isRecord(payload.review_assessment)
        ? payload.review_assessment
        : {};
      const caseCandidates = Array.isArray(review.explicit_case_candidates)
        ? review.explicit_case_candidates
        : [];
      const persisted = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM literature_intake_case_candidates
         WHERE tenant_id=$1 AND intake_export_id=$2`,
        [tenantId, row.id],
      );
      if (Number(persisted.rows[0]?.count || 0) !== caseCandidates.length) {
        findings.push({
          findingKey: `intake-candidates:${row.id}`,
          findingType: "INTAKE_INTEGRITY",
          severity: "CRITICAL",
          packageId: row.package_id,
          summary:
            "Intake export case-candidate ledger does not match the governed multi-patient payload.",
          details: {
            exportId: row.id,
            payloadCandidateCount: caseCandidates.length,
            persistedCandidateCount: Number(persisted.rows[0]?.count || 0),
          },
        });
      }
    }
  }

  const ai = classifyAiFailureRate({
    executions: Number(aiSummary.rows[0]?.executions || 0),
    failures: Number(aiSummary.rows[0]?.failures || 0),
  });
  if (ai.severity) {
    findings.push({
      findingKey: "ai-failure-rate:24h",
      findingType: "AI_FAILURE_RATE",
      severity: ai.severity,
      summary: `AI execution failure rate is ${ai.ratePercent}% over the last 24 hours.`,
      details: {
        executions: Number(aiSummary.rows[0]?.executions || 0),
        failures: Number(aiSummary.rows[0]?.failures || 0),
        ratePercent: ai.ratePercent,
      },
    });
  }

  const configCounts = new Map(
    configs.rows.map((row) => [row.resource_type, Number(row.active_count)]),
  );
  for (const resourceType of [
    "PRODUCT_MASTER",
    "SEARCH_PROFILE",
    "LITERATURE_CALENDAR",
    "LABEL_REFERENCE",
    "CAUSALITY_METHOD",
  ]) {
    if ((configCounts.get(resourceType) || 0) > 0) continue;
    findings.push({
      findingKey: `configuration:${resourceType}`,
      findingType: "CONFIGURATION_GAP",
      severity:
        resourceType === "PRODUCT_MASTER" ||
        resourceType === "LABEL_REFERENCE" ||
        resourceType === "CAUSALITY_METHOD"
          ? "CRITICAL"
          : "WARNING",
      summary: `No active ${resourceType} configuration is available.`,
      details: { resourceType },
    });
  }

  if (!process.env.CRON_SECRET?.trim()) {
    findings.push({
      findingKey: "configuration:CRON_SECRET",
      findingType: "CONFIGURATION_GAP",
      severity: "CRITICAL",
      summary:
        "CRON_SECRET is not configured; automated scheduler and reliability sweeps cannot be authenticated.",
      details: { environmentVariable: "CRON_SECRET" },
    });
  }

  return findings;
}

export async function runReliabilitySweep(tenantId: string): Promise<{
  generatedAt: string;
  findings: FindingCandidate[];
  openCritical: number;
  openWarning: number;
}> {
  const pool = getPostgresPool();
  const findings = await collectFindings(tenantId);
  const activeKeys = findings.map((finding) => finding.findingKey);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const finding of findings) {
      await client.query(
        `INSERT INTO reliability_findings (
           tenant_id, finding_key, finding_type, severity, status,
           package_id, scheduled_run_id, summary, details
         ) VALUES ($1,$2,$3,$4,'OPEN',$5,$6,$7,$8::jsonb)
         ON CONFLICT (tenant_id, finding_key)
         DO UPDATE SET
           finding_type=EXCLUDED.finding_type,
           severity=EXCLUDED.severity,
           status=CASE
             WHEN reliability_findings.status='RESOLVED' THEN 'OPEN'
             ELSE reliability_findings.status
           END,
           package_id=EXCLUDED.package_id,
           scheduled_run_id=EXCLUDED.scheduled_run_id,
           summary=EXCLUDED.summary,
           details=EXCLUDED.details,
           last_seen_at=now(),
           observed_count=reliability_findings.observed_count + 1,
           resolved_at=NULL`,
        [
          tenantId,
          finding.findingKey,
          finding.findingType,
          finding.severity,
          finding.packageId || null,
          finding.scheduledRunId || null,
          finding.summary,
          JSON.stringify(finding.details || {}),
        ],
      );
    }

    await client.query(
      `UPDATE reliability_findings
       SET status='RESOLVED', resolved_at=now(), last_seen_at=now()
       WHERE tenant_id=$1
         AND status <> 'RESOLVED'
         AND finding_type = ANY($2::text[])
         AND NOT (finding_key = ANY($3::text[]))`,
      [
        tenantId,
        [
          "STUCK_WORKFLOW",
          "STALE_SCHEDULED_RUN",
          "SCHEDULER_ALERT",
          "INTAKE_INTEGRITY",
          "AI_FAILURE_RATE",
          "CONFIGURATION_GAP",
        ],
        activeKeys,
      ],
    );

    const counts = await client.query<{ severity: string; count: string }>(
      `SELECT severity, count(*)::text AS count
       FROM reliability_findings
       WHERE tenant_id=$1 AND status <> 'RESOLVED'
       GROUP BY severity`,
      [tenantId],
    );

    const countMap = new Map(
      counts.rows.map((row) => [row.severity, Number(row.count)]),
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, event_type, event_category, outcome, details
       ) VALUES ($1,'RELIABILITY_SWEEP_COMPLETED','PLATFORM_RELIABILITY',$2,$3::jsonb)`,
      [
        tenantId,
        (countMap.get("CRITICAL") || 0) > 0 ? "warning" : "success",
        JSON.stringify({
          observedFindingCount: findings.length,
          openCritical: countMap.get("CRITICAL") || 0,
          openWarning: countMap.get("WARNING") || 0,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      generatedAt: new Date().toISOString(),
      findings,
      openCritical: countMap.get("CRITICAL") || 0,
      openWarning: countMap.get("WARNING") || 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runReliabilitySweepsForAllTenants() {
  const tenants = await getPostgresPool().query<{ id: string; tenant_key: string }>(
    `SELECT id, tenant_key FROM tenants WHERE status='active' ORDER BY tenant_key`,
  );

  const results = [];
  for (const tenant of tenants.rows) {
    try {
      results.push({
        tenantKey: tenant.tenant_key,
        success: true,
        result: await runReliabilitySweep(tenant.id),
      });
    } catch (error) {
      results.push({
        tenantKey: tenant.tenant_key,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tenantCount: tenants.rows.length,
    results,
  };
}

export async function listReliabilityFindings(input: {
  tenantId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit || 100, 500));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT finding.id, finding.finding_key, finding.finding_type,
            finding.severity, finding.status, finding.summary, finding.details,
            finding.first_seen_at::text, finding.last_seen_at::text,
            finding.observed_count, package.package_key,
            scheduled.schedule_key
     FROM reliability_findings finding
     LEFT JOIN literature_packages package
       ON package.id=finding.package_id AND package.tenant_id=finding.tenant_id
     LEFT JOIN literature_scheduled_search_runs scheduled
       ON scheduled.id=finding.scheduled_run_id
      AND scheduled.tenant_id=finding.tenant_id
     WHERE finding.tenant_id=$1
     ORDER BY
       CASE finding.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
       CASE finding.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
       finding.last_seen_at DESC
     LIMIT $2`,
    [input.tenantId, limit],
  );
  return result.rows;
}
