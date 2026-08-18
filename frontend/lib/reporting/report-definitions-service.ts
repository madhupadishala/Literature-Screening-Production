import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { REPORT_FIELDS, type ReportFieldId, type ReportFilters } from "./hits-screening-report-service";

export interface ReportDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  filters: Omit<ReportFilters, "tenantId" | "fields">;
  fields: ReportFieldId[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
}

interface ReportDefinitionRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  filters: unknown;
  fields: unknown;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  last_run_at: Date | null;
}

function mapRow(row: ReportDefinitionRow): ReportDefinition {
  const validFieldIds = new Set(REPORT_FIELDS.map((field) => field.id));
  const rawFields = Array.isArray(row.fields) ? row.fields : [];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    filters: (row.filters ?? {}) as Omit<ReportFilters, "tenantId" | "fields">,
    fields: rawFields.filter((id): id is ReportFieldId => typeof id === "string" && validFieldIds.has(id as ReportFieldId)),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
  };
}

export interface CreateReportDefinitionInput {
  tenantId: string;
  name: string;
  description?: string;
  filters: Omit<ReportFilters, "tenantId" | "fields">;
  fields: ReportFieldId[];
  createdBy?: string;
}

export async function createReportDefinition(input: CreateReportDefinitionInput): Promise<ReportDefinition> {
  const pool = getPostgresPool();

  const result = await pool.query<ReportDefinitionRow>(
    `INSERT INTO report_definitions (tenant_id, name, description, filters, fields, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     RETURNING *`,
    [
      input.tenantId,
      input.name,
      input.description ?? null,
      JSON.stringify(input.filters ?? {}),
      JSON.stringify(input.fields ?? []),
      input.createdBy ?? null,
    ],
  );

  return mapRow(result.rows[0]);
}

export async function listReportDefinitions(tenantId: string): Promise<ReportDefinition[]> {
  const pool = getPostgresPool();

  const result = await pool.query<ReportDefinitionRow>(
    `SELECT * FROM report_definitions WHERE tenant_id = $1 ORDER BY updated_at DESC`,
    [tenantId],
  );

  return result.rows.map(mapRow);
}

export async function getReportDefinition(tenantId: string, id: string): Promise<ReportDefinition | null> {
  const pool = getPostgresPool();

  const result = await pool.query<ReportDefinitionRow>(
    `SELECT * FROM report_definitions WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface UpdateReportDefinitionInput {
  name?: string;
  description?: string;
  filters?: Omit<ReportFilters, "tenantId" | "fields">;
  fields?: ReportFieldId[];
}

export async function updateReportDefinition(
  tenantId: string,
  id: string,
  input: UpdateReportDefinitionInput,
): Promise<ReportDefinition | null> {
  const pool = getPostgresPool();

  const result = await pool.query<ReportDefinitionRow>(
    `UPDATE report_definitions
        SET name = COALESCE($3, name),
            description = COALESCE($4, description),
            filters = COALESCE($5::jsonb, filters),
            fields = COALESCE($6::jsonb, fields),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [
      tenantId,
      id,
      input.name ?? null,
      input.description ?? null,
      input.filters ? JSON.stringify(input.filters) : null,
      input.fields ? JSON.stringify(input.fields) : null,
    ],
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteReportDefinition(tenantId: string, id: string): Promise<boolean> {
  const pool = getPostgresPool();

  const result = await pool.query(
    `DELETE FROM report_definitions WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function markReportDefinitionRun(tenantId: string, id: string): Promise<void> {
  const pool = getPostgresPool();

  await pool.query(
    `UPDATE report_definitions SET last_run_at = now() WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
}
