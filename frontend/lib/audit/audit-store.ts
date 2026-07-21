import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import type {
  AuditRecord,
  AuditSearchFilters,
  AuditSearchResult,
  AuditSeverity,
} from "./audit-types";

interface AuditRow {
  id: string;
  event_type: string;
  event_category: string;
  outcome: string;
  package_id: string | null;
  package_key: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  request_id: string | null;
  correlation_id: string | null;
  source_ip: string | null;
  details: Record<string, unknown>;
  occurred_at: string;
  total_count: string | number;
}

function severity(row: AuditRow): AuditSeverity {
  const value = `${row.event_type} ${row.outcome}`.toLowerCase();
  if (/fail|denied|critical|error|rejected/.test(value)) return "CRITICAL";
  if (/warning|flag|override|conflict|retry/.test(value)) return "WARNING";
  return "INFO";
}

function mapRow(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    eventCategory: row.event_category,
    outcome: row.outcome,
    severity: severity(row),
    packageId: row.package_id || undefined,
    packageKey: row.package_key || undefined,
    performedBy: {
      id: row.actor_id || undefined,
      name: row.actor_name || "System",
      role: row.actor_role || "SYSTEM",
    },
    performedAt: new Date(row.occurred_at).toISOString(),
    requestId: row.request_id || undefined,
    correlationId: row.correlation_id || undefined,
    ipAddress: row.source_ip || undefined,
    details: row.details || {},
  };
}

function validDate(value: string | undefined, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(
    endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value,
  );
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid audit date: ${value}.`);
  return date.toISOString();
}

export async function searchAuditRecords(input: {
  principal: RequestPrincipal;
  filters?: AuditSearchFilters;
  page?: number;
  pageSize?: number;
}): Promise<AuditSearchResult> {
  const filters = input.filters || {};
  const page = Math.max(1, Math.floor(input.page || 1));
  const pageSize = Math.max(1, Math.min(Math.floor(input.pageSize || 25), 250));
  const values: unknown[] = [input.principal.tenantId];
  const where = ["event.tenant_id = $1"];

  function condition(sql: string, value: unknown): void {
    values.push(value);
    where.push(sql.replace("?", `$${values.length}`));
  }

  if (filters.packageId?.trim()) {
    condition(
      "(event.package_id::text = ? OR package.package_key ILIKE ?)",
      filters.packageId.trim(),
    );
    values.push(`%${filters.packageId.trim()}%`);
    where[where.length - 1] = where[where.length - 1].replace(/\?\)$/, `$${values.length})`);
  }
  if (filters.actorId?.trim()) condition("event.actor_id::text = ?", filters.actorId.trim());
  if (filters.eventType?.trim()) condition("event.event_type = ?", filters.eventType.trim());
  if (filters.eventCategory?.trim())
    condition("event.event_category = ?", filters.eventCategory.trim());
  if (filters.outcome?.trim()) condition("event.outcome = ?", filters.outcome.trim());
  const from = validDate(filters.dateFrom);
  const to = validDate(filters.dateTo, true);
  if (from) condition("event.occurred_at >= ?", from);
  if (to) condition("event.occurred_at <= ?", to);
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    values.push(term);
    const parameter = `$${values.length}`;
    where.push(`(
      event.id::text ILIKE ${parameter} OR event.event_type ILIKE ${parameter}
      OR event.event_category ILIKE ${parameter} OR event.outcome ILIKE ${parameter}
      OR event.details::text ILIKE ${parameter} OR package.package_key ILIKE ${parameter}
      OR actor.display_name ILIKE ${parameter} OR actor.email ILIKE ${parameter}
    )`);
  }
  if (filters.severity && filters.severity !== "ALL") {
    const expression = "lower(event.event_type || ' ' || event.outcome)";
    if (filters.severity === "CRITICAL")
      where.push(`${expression} ~ '(fail|denied|critical|error|rejected)'`);
    if (filters.severity === "WARNING")
      where.push(`${expression} ~ '(warning|flag|override|conflict|retry)'`);
    if (filters.severity === "INFO")
      where.push(
        `${expression} !~ '(fail|denied|critical|error|rejected|warning|flag|override|conflict|retry)'`,
      );
  }

  values.push(pageSize, (page - 1) * pageSize);
  const result = await getPostgresPool().query<AuditRow>(
    `SELECT event.id, event.event_type, event.event_category, event.outcome,
       event.package_id, package.package_key, event.actor_id,
       actor.display_name AS actor_name, membership.role_key AS actor_role,
       event.request_id, event.correlation_id, event.source_ip::text,
       event.details, event.occurred_at, count(*) OVER() AS total_count
     FROM audit_events event
     LEFT JOIN literature_packages package
       ON package.id = event.package_id AND package.tenant_id = event.tenant_id
     LEFT JOIN application_users actor ON actor.id = event.actor_id
     LEFT JOIN tenant_memberships membership
       ON membership.user_id = event.actor_id AND membership.tenant_id = event.tenant_id
     WHERE ${where.join(" AND ")}
     ORDER BY event.occurred_at DESC, event.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    total: Number(result.rows[0]?.total_count || 0),
    page,
    pageSize,
    records: result.rows.map(mapRow),
  };
}

export async function recordAuditExport(input: {
  principal: RequestPrincipal;
  filters: AuditSearchFilters;
  exportedCount: number;
}): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome, details
     ) VALUES ($1, $2, 'AUDIT_LOG_EXPORTED', 'ENTERPRISE_AUDIT', 'success', $3::jsonb)`,
    [
      input.principal.tenantId,
      input.principal.userId,
      JSON.stringify({
        format: "csv",
        exportedCount: input.exportedCount,
        filters: input.filters,
      }),
    ],
  );
}
