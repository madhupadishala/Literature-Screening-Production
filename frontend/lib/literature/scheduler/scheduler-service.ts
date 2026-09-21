import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { resolveActiveConfigurations } from "@/lib/configuration/active-resolver";
import { executeAdHocSearch } from "@/lib/literature/adhoc-search/search-service";
import type {
  NormalizedLiteratureResult,
} from "@/lib/literature/adhoc-search/types";
import { executeProductionSearchToHits } from "@/lib/literature/hits/production-search-to-hits-service";
import {
  assessScheduleOccurrence,
  profileDateWindow,
  type LiteratureCalendarRecord,
} from "@/lib/literature/scheduler/schedule-engine";
import { roleHasPermission } from "@/lib/rbac/permissions";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload) && Array.isArray(payload.records)) {
    return payload.records.filter(isRecord);
  }
  return [];
}

function calendarRecord(value: Record<string, unknown>): LiteratureCalendarRecord {
  return {
    calendarId: text(value.calendarId || value.scheduleKey),
    searchProfileKey: text(value.searchProfileKey || value.profileKey),
    frequency: text(value.frequency).toUpperCase() as LiteratureCalendarRecord["frequency"],
    executionTime: text(value.executionTime),
    timezone: text(value.timezone),
    executionDay: text(value.executionDay) || undefined,
    dayOfMonth: value.dayOfMonth ? Number(value.dayOfMonth) : undefined,
    graceMinutes: value.graceMinutes ? Number(value.graceMinutes) : undefined,
    catchUpHours: value.catchUpHours ? Number(value.catchUpHours) : undefined,
    missedSearchDetection: value.missedSearchDetection !== false,
    status: text(value.status || "ACTIVE"),
  };
}

async function ensureSchedulerPrincipal(input: {
  tenantId: string;
  tenantKey: string;
}): Promise<RequestPrincipal> {
  const pool = getPostgresPool();
  const externalSubject = `system:literature-scheduler:${input.tenantId}`;
  const email = `literature-scheduler+${input.tenantKey}@system.theclinixai.local`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const user = await client.query<{
      id: string;
      email: string;
      display_name: string;
    }>(
      `INSERT INTO application_users (
         external_subject, email, display_name, status
       ) VALUES ($1,$2,'ClinixAI Literature Scheduler','active')
       ON CONFLICT (email)
       DO UPDATE SET
         external_subject = COALESCE(application_users.external_subject, EXCLUDED.external_subject),
         display_name = EXCLUDED.display_name,
         status = 'active',
         updated_at = now()
       RETURNING id, email, display_name`,
      [externalSubject, email],
    );

    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status
       ) VALUES ($1,$2,'SYSTEM_SCHEDULER','[]'::jsonb,'active')
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET
         role_key='SYSTEM_SCHEDULER',
         membership_status='active',
         updated_at=now()`,
      [input.tenantId, user.rows[0].id],
    );

    await client.query("COMMIT");

    const customPermissions: string[] = [];
    return {
      tenantId: input.tenantId,
      tenantKey: input.tenantKey,
      userId: user.rows[0].id,
      email: user.rows[0].email,
      displayName: user.rows[0].display_name,
      roleKey: "SYSTEM_SCHEDULER",
      customPermissions,
      hasPermission: (permission) =>
        roleHasPermission("SYSTEM_SCHEDULER", permission, customPermissions),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createAlert(input: {
  tenantId: string;
  runId?: string;
  scheduleKey: string;
  alertType:
    | "MISSED_SEARCH"
    | "FAILED_SEARCH"
    | "PARTIAL_SEARCH"
    | "CONFIGURATION_ERROR";
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO literature_search_schedule_alerts (
       tenant_id, scheduled_run_id, schedule_key, alert_type,
       severity, message, details
     )
     SELECT $1,$2,$3,$4,$5,$6,$7::jsonb
     WHERE NOT EXISTS (
       SELECT 1
       FROM literature_search_schedule_alerts existing
       WHERE existing.tenant_id = $1
         AND existing.schedule_key = $3
         AND existing.alert_type = $4
         AND existing.status <> 'RESOLVED'
         AND existing.scheduled_run_id IS NOT DISTINCT FROM $2::uuid
     )`,
    [
      input.tenantId,
      input.runId || null,
      input.scheduleKey,
      input.alertType,
      input.severity,
      input.message,
      JSON.stringify(input.details || {}),
    ],
  );
}

async function claimRun(input: {
  principal: RequestPrincipal;
  calendarVersionId: string;
  profileVersionId: string;
  scheduleKey: string;
  scheduledFor: Date;
  status?: "QUEUED" | "MISSED";
  details?: Record<string, unknown>;
}): Promise<string | null> {
  const result = await getPostgresPool().query<{ id: string }>(
    `INSERT INTO literature_scheduled_search_runs (
       tenant_id, schedule_key, calendar_version_id,
       search_profile_version_id, scheduled_for, status,
       execution_details
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (tenant_id, schedule_key, scheduled_for) DO NOTHING
     RETURNING id`,
    [
      input.principal.tenantId,
      input.scheduleKey,
      input.calendarVersionId,
      input.profileVersionId,
      input.scheduledFor.toISOString(),
      input.status || "QUEUED",
      JSON.stringify(input.details || {}),
    ],
  );
  return result.rows[0]?.id || null;
}

function findProfile(
  active: Awaited<ReturnType<typeof resolveActiveConfigurations>>,
  profileKey: string,
): {
  versionId: string;
  effectiveFrom: Date | null;
  record: Record<string, unknown>;
} | null {
  for (const version of active.searchProfiles) {
    const record = recordsFromPayload(version.payload).find(
      (candidate) =>
        text(candidate.profileKey || candidate.searchProfileKey) === profileKey &&
        text(candidate.status || "ACTIVE").toUpperCase() === "ACTIVE",
    );
    if (record) {
      return {
        versionId: version.id,
        effectiveFrom: version.effectiveFrom
          ? new Date(version.effectiveFrom)
          : null,
        record,
      };
    }
  }
  return null;
}

function hitsBatches(
  results: Array<NormalizedLiteratureResult & { id: string }>,
): string[][] {
  const groups = new Map<string, string[]>();

  for (const result of results) {
    const key = result.duplicateGroup || result.dedupeKey || result.id;
    const group = groups.get(key) || [];
    group.push(result.id);
    groups.set(key, group);
  }

  const batches: string[][] = [];
  let current: string[] = [];

  for (const group of groups.values()) {
    if (group.length > 100) {
      throw new Error(
        "A single duplicate article group exceeds the governed 100-result Hits handoff limit.",
      );
    }

    if (current.length > 0 && current.length + group.length > 100) {
      batches.push(current);
      current = [];
    }
    current.push(...group);
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function executeHitsForResults(input: {
  principal: RequestPrincipal;
  results: Array<NormalizedLiteratureResult & { id: string }>;
}) {
  const batches = hitsBatches(input.results);
  const packages: Array<Record<string, unknown>> = [];
  let failedCount = 0;
  let partial = false;

  for (const resultIds of batches) {
    const execution = await executeProductionSearchToHits({
      principal: input.principal,
      resultIds,
    });
    packages.push(...(execution.packages as Array<Record<string, unknown>>));
    failedCount += execution.failedCount;
    if (execution.status !== "completed") partial = true;
  }

  return {
    status:
      packages.length > 0 && failedCount === packages.length
        ? "failed"
        : partial || failedCount > 0
          ? "partial"
          : "completed",
    packages,
    failedCount,
    batchCount: batches.length,
  };
}

async function runSchedule(input: {
  principal: RequestPrincipal;
  calendarVersionId: string;
  profileVersionId: string;
  record: LiteratureCalendarRecord;
  profile: Record<string, unknown>;
  runId: string;
  scheduledFor: Date;
  latenessMinutes: number;
  missedThresholdExceeded: boolean;
}) {
  const pool = getPostgresPool();

  await pool.query(
    `UPDATE literature_scheduled_search_runs
     SET status='RUNNING', started_at=now(), updated_at=now(),
         execution_details=execution_details || $3::jsonb
     WHERE tenant_id=$1 AND id=$2`,
    [
      input.principal.tenantId,
      input.runId,
      JSON.stringify({
        executionPurpose: "SCHEDULED_PRODUCTION",
        schedulerActor: input.principal.email,
        latenessMinutes: input.latenessMinutes,
      }),
    ],
  );

  await pool.query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome, details
     ) VALUES ($1,$2,'SCHEDULED_PRODUCTION_SEARCH_STARTED',
       'LITERATURE_SEARCH','started',$3::jsonb)`,
    [
      input.principal.tenantId,
      input.principal.userId,
      JSON.stringify({
        scheduledRunId: input.runId,
        scheduleKey: input.record.calendarId,
        scheduledFor: input.scheduledFor.toISOString(),
        calendarVersionId: input.calendarVersionId,
        searchProfileKey: input.record.searchProfileKey,
        searchProfileVersionId: input.profileVersionId,
        latenessMinutes: input.latenessMinutes,
      }),
    ],
  );

  if (
    input.missedThresholdExceeded &&
    input.record.missedSearchDetection !== false
  ) {
    await createAlert({
      tenantId: input.principal.tenantId,
      runId: input.runId,
      scheduleKey: input.record.calendarId,
      alertType: "MISSED_SEARCH",
      severity: "WARNING",
      message: `Scheduled literature search started ${input.latenessMinutes} minute(s) late and was executed as a governed catch-up run.`,
      details: { scheduledFor: input.scheduledFor.toISOString() },
    });
  }

  try {
    const lookbackDays = Math.max(
      1,
      Number(input.profile.lookbackDays || 7),
    );
    const window = profileDateWindow({
      scheduledFor: input.scheduledFor,
      lookbackDays,
    });

    const execution = await executeAdHocSearch({
      principal: input.principal,
      criteria: {
        executionPurpose: "SCHEDULED_PRODUCTION",
        searchString: text(input.profile.searchString) || undefined,
        product: text(input.profile.product) || undefined,
        productId:
          text(input.profile.productId || input.profile.clientProductId) ||
          undefined,
        whodrugId: text(input.profile.whodrugId) || undefined,
        sourceKeys: Array.isArray(input.profile.sourceKeys)
          ? input.profile.sourceKeys.map(String)
          : [],
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
        limit: Math.max(
          1,
          Math.min(
            Number(
              input.profile.limit ||
                input.profile.maxResults ||
                100,
            ),
            500,
          ),
        ),
      },
      scheduleContext: {
        scheduleKey: input.record.calendarId,
        scheduledRunId: input.runId,
        scheduledFor: input.scheduledFor.toISOString(),
        calendarVersionId: input.calendarVersionId,
        searchProfileKey: input.record.searchProfileKey,
        searchProfileVersionId: input.profileVersionId,
      },
    });

    if (!execution.searchEvidencePackage) {
      throw new Error(
        "Scheduled production search did not create a Search Evidence Package.",
      );
    }

    const hits =
      execution.results.length > 0
        ? await executeHitsForResults({
            principal: input.principal,
            results: execution.results,
          })
        : null;

    const hitsFailedCount = hits?.failedCount || 0;
    const finalStatus =
      execution.status === "failed" ||
      (hits &&
        hits.packages.length > 0 &&
        hits.failedCount === hits.packages.length)
        ? "FAILED"
        : execution.status === "partial" ||
            hits?.status === "partial" ||
            hitsFailedCount > 0
          ? "PARTIAL"
          : "COMPLETED";

    await pool.query(
      `UPDATE literature_scheduled_search_runs
       SET status=$3,
           search_id=$4,
           search_evidence_package_id=$5,
           result_count=$6,
           hits_package_count=$7,
           hits_failed_count=$8,
           connector_errors=$9::jsonb,
           execution_details=execution_details || $10::jsonb,
           completed_at=now(),
           updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [
        input.principal.tenantId,
        input.runId,
        finalStatus,
        execution.searchId,
        execution.searchEvidencePackage.packageId,
        execution.resultCount,
        hits?.packages.length || 0,
        hitsFailedCount,
        JSON.stringify(execution.connectorErrors),
        JSON.stringify({
          searchKey: execution.searchKey,
          searchEvidencePackageKey:
            execution.searchEvidencePackage.packageKey,
          searchEvidencePackageSha256:
            execution.searchEvidencePackage.sha256,
          hitsStatus: hits?.status || "NOT_APPLICABLE_ZERO_RESULTS",
          hitsBatchCount: hits?.batchCount || 0,
        }),
      ],
    );

    if (finalStatus === "PARTIAL") {
      await createAlert({
        tenantId: input.principal.tenantId,
        runId: input.runId,
        scheduleKey: input.record.calendarId,
        alertType: "PARTIAL_SEARCH",
        severity: "WARNING",
        message:
          "Scheduled literature search completed partially and requires operational review.",
        details: {
          connectorErrors: execution.connectorErrors,
          hitsFailedCount,
        },
      });
    } else if (finalStatus === "FAILED") {
      await createAlert({
        tenantId: input.principal.tenantId,
        runId: input.runId,
        scheduleKey: input.record.calendarId,
        alertType: "FAILED_SEARCH",
        severity: "CRITICAL",
        message:
          "Scheduled literature search failed and requires operational intervention.",
        details: {
          connectorErrors: execution.connectorErrors,
          hitsFailedCount,
        },
      });
    }

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SCHEDULED_PRODUCTION_SEARCH_COMPLETED',
         'LITERATURE_SEARCH',$3,$4::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        finalStatus === "COMPLETED"
          ? "success"
          : finalStatus === "PARTIAL"
            ? "partial"
            : "failure",
        JSON.stringify({
          scheduledRunId: input.runId,
          scheduleKey: input.record.calendarId,
          scheduledFor: input.scheduledFor.toISOString(),
          calendarVersionId: input.calendarVersionId,
          searchProfileKey: input.record.searchProfileKey,
          searchProfileVersionId: input.profileVersionId,
          searchId: execution.searchId,
          searchKey: execution.searchKey,
          resultCount: execution.resultCount,
          searchEvidencePackageId:
            execution.searchEvidencePackage.packageId,
          searchEvidencePackageKey:
            execution.searchEvidencePackage.packageKey,
          hitsPackageCount: hits?.packages.length || 0,
          hitsFailedCount,
          hitsBatchCount: hits?.batchCount || 0,
        }),
      ],
    );

    return { runId: input.runId, status: finalStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await pool.query(
      `UPDATE literature_scheduled_search_runs
       SET status='FAILED',
           execution_details=execution_details || $3::jsonb,
           completed_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [
        input.principal.tenantId,
        input.runId,
        JSON.stringify({ error: message }),
      ],
    );

    await createAlert({
      tenantId: input.principal.tenantId,
      runId: input.runId,
      scheduleKey: input.record.calendarId,
      alertType: "FAILED_SEARCH",
      severity: "CRITICAL",
      message,
    });

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SCHEDULED_PRODUCTION_SEARCH_FAILED',
         'LITERATURE_SEARCH','failure',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          scheduledRunId: input.runId,
          scheduleKey: input.record.calendarId,
          scheduledFor: input.scheduledFor.toISOString(),
          error: message,
        }),
      ],
    );

    throw error;
  }
}

export async function executeDueScheduledSearches(input?: {
  tenantId?: string;
  now?: Date;
}) {
  const pool = getPostgresPool();
  const tenants = await pool.query<{
    id: string;
    tenant_key: string;
  }>(
    `SELECT id, tenant_key
     FROM tenants
     WHERE status='active'
       AND ($1::uuid IS NULL OR id=$1::uuid)
     ORDER BY tenant_key`,
    [input?.tenantId || null],
  );

  const now = input?.now || new Date();
  const summary: Array<Record<string, unknown>> = [];

  for (const tenant of tenants.rows) {
    const active = await resolveActiveConfigurations(tenant.id);
    const calendarVersion = active.literatureCalendar;

    if (!calendarVersion) {
      summary.push({
        tenantKey: tenant.tenant_key,
        status: "NO_ACTIVE_CALENDAR",
      });
      continue;
    }

    const principal = await ensureSchedulerPrincipal({
      tenantId: tenant.id,
      tenantKey: tenant.tenant_key,
    });

    for (const value of recordsFromPayload(calendarVersion.payload)) {
      const record = calendarRecord(value);
      if (!record.calendarId || !record.searchProfileKey) continue;

      const profile = findProfile(active, record.searchProfileKey);
      if (!profile) {
        await createAlert({
          tenantId: tenant.id,
          scheduleKey: record.calendarId,
          alertType: "CONFIGURATION_ERROR",
          severity: "CRITICAL",
          message: `Active Search Profile "${record.searchProfileKey}" was not found for schedule "${record.calendarId}".`,
        });
        summary.push({
          tenantKey: tenant.tenant_key,
          scheduleKey: record.calendarId,
          status: "PROFILE_NOT_FOUND",
        });
        continue;
      }

      const assessment = assessScheduleOccurrence(record, now);
      if (
        assessment.action === "NOT_DUE" ||
        !assessment.scheduledFor
      ) {
        continue;
      }

      const calendarEffectiveFrom = calendarVersion.effectiveFrom
        ? new Date(calendarVersion.effectiveFrom)
        : null;

      if (
        (calendarEffectiveFrom &&
          assessment.scheduledFor < calendarEffectiveFrom) ||
        (profile.effectiveFrom &&
          assessment.scheduledFor < profile.effectiveFrom)
      ) {
        summary.push({
          tenantKey: tenant.tenant_key,
          scheduleKey: record.calendarId,
          status: "PRE_ACTIVATION_OCCURRENCE_SKIPPED",
          scheduledFor: assessment.scheduledFor.toISOString(),
        });
        continue;
      }

      const runId = await claimRun({
        principal,
        calendarVersionId: calendarVersion.id,
        profileVersionId: profile.versionId,
        scheduleKey: record.calendarId,
        scheduledFor: assessment.scheduledFor,
        status:
          assessment.action === "MISSED" ? "MISSED" : "QUEUED",
        details: {
          assessment: assessment.action,
          latenessMinutes: assessment.latenessMinutes,
        },
      });
      if (!runId) continue;

      if (assessment.action === "MISSED") {
        await createAlert({
          tenantId: tenant.id,
          runId,
          scheduleKey: record.calendarId,
          alertType: "MISSED_SEARCH",
          severity: "CRITICAL",
          message:
            "Scheduled literature search exceeded the configured catch-up window and was marked MISSED.",
          details: {
            scheduledFor: assessment.scheduledFor.toISOString(),
            latenessMinutes: assessment.latenessMinutes,
          },
        });

        await pool.query(
          `INSERT INTO audit_events (
             tenant_id, actor_id, event_type, event_category, outcome, details
           ) VALUES ($1,$2,'SCHEDULED_PRODUCTION_SEARCH_MISSED',
             'LITERATURE_SEARCH','failure',$3::jsonb)`,
          [
            tenant.id,
            principal.userId,
            JSON.stringify({
              scheduledRunId: runId,
              scheduleKey: record.calendarId,
              scheduledFor: assessment.scheduledFor.toISOString(),
              latenessMinutes: assessment.latenessMinutes,
              calendarVersionId: calendarVersion.id,
              searchProfileKey: record.searchProfileKey,
              searchProfileVersionId: profile.versionId,
            }),
          ],
        );

        summary.push({
          tenantKey: tenant.tenant_key,
          scheduleKey: record.calendarId,
          runId,
          status: "MISSED",
        });
        continue;
      }

      try {
        const result = await runSchedule({
          principal,
          calendarVersionId: calendarVersion.id,
          profileVersionId: profile.versionId,
          record,
          profile: profile.record,
          runId,
          scheduledFor: assessment.scheduledFor,
          latenessMinutes: assessment.latenessMinutes || 0,
          missedThresholdExceeded: Boolean(
            assessment.missedThresholdExceeded,
          ),
        });
        summary.push({
          tenantKey: tenant.tenant_key,
          scheduleKey: record.calendarId,
          ...result,
        });
      } catch (error) {
        summary.push({
          tenantKey: tenant.tenant_key,
          scheduleKey: record.calendarId,
          runId,
          status: "FAILED",
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
  }

  return {
    evaluatedAt: now.toISOString(),
    tenantCount: tenants.rows.length,
    runs: summary,
  };
}

export async function listScheduledSearchOperations(input: {
  tenantId: string;
  limit?: number;
}) {
  const limit = Math.max(
    1,
    Math.min(input.limit || 50, 200),
  );
  const [runs, alerts] = await Promise.all([
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT *
       FROM literature_scheduled_search_runs
       WHERE tenant_id=$1
       ORDER BY scheduled_for DESC, created_at DESC
       LIMIT $2`,
      [input.tenantId, limit],
    ),
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT *
       FROM literature_search_schedule_alerts
       WHERE tenant_id=$1
       ORDER BY created_at DESC
       LIMIT $2`,
      [input.tenantId, limit],
    ),
  ]);

  return { runs: runs.rows, alerts: alerts.rows };
}
