import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_TYPES = new Set([
  "TRIAGE",
  "VALIDITY",
  "DUPLICATE_REVIEW",
  "CASE_PROCESSING",
  "QC",
  "MEDICAL_REVIEW",
  "FINALIZATION",
  "SUBMISSION_REVIEW",
]);

const TASK_STATUSES = new Set(["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const entityType = request.nextUrl.searchParams.get("entityType")?.trim().toUpperCase();
    const taskType = request.nextUrl.searchParams.get("taskType")?.trim().toUpperCase();
    const requestedStatus = request.nextUrl.searchParams.get("status")?.trim().toUpperCase();

    if (entityType !== "INTAKE_RECORD" && entityType !== "CASE") {
      throw new Error("entityType must be INTAKE_RECORD or CASE.");
    }
    if (!taskType || !TASK_TYPES.has(taskType)) {
      throw new Error("A valid taskType is required.");
    }
    if (requestedStatus && !TASK_STATUSES.has(requestedStatus)) {
      throw new Error("status is invalid.");
    }

    const principal = await requireModulePermission(
      request,
      entityType === "INTAKE_RECORD" ? NEXUS_MODULES.INTAKE : NEXUS_MODULES.CASE_PROCESSING,
      entityType === "INTAKE_RECORD" ? PERMISSIONS.INTAKE_VIEW : PERMISSIONS.CASE_VIEW,
    );

    const values: unknown[] = [principal.tenantId, entityType, taskType];
    let statusSql = "AND task.status IN ('OPEN','ASSIGNED','IN_PROGRESS')";
    if (requestedStatus) {
      values.push(requestedStatus);
      statusSql = `AND task.status = $${values.length}`;
    }

    const result = await getPostgresPool().query(
      `SELECT task.id, task.task_key, task.entity_type, task.entity_id,
              task.task_type, task.status, task.assigned_to,
              task.due_at, task.completed_at, task.outcome,
              task.created_at, task.updated_at,
              intake.intake_key, intake.priority AS intake_priority,
              intake.seriousness_status AS intake_seriousness_status,
              intake.triage_outcome, intake.case_relationship,
              safety_case.case_key, safety_case.case_status,
              safety_case.priority AS case_priority,
              safety_case.seriousness_status AS case_seriousness_status
         FROM safety_review_tasks task
         LEFT JOIN safety_intake_records intake
           ON task.entity_type = 'INTAKE_RECORD'
          AND intake.tenant_id = task.tenant_id
          AND intake.id = task.entity_id
         LEFT JOIN safety_cases safety_case
           ON task.entity_type = 'CASE'
          AND safety_case.tenant_id = task.tenant_id
          AND safety_case.id = task.entity_id
        WHERE task.tenant_id = $1
          AND task.entity_type = $2
          AND task.task_type = $3
          ${statusSql}
        ORDER BY task.due_at NULLS LAST, task.created_at ASC
        LIMIT 500`,
      values,
    );

    return Response.json({
      success: true,
      data: {
        records: result.rows.map((row) => ({
          id: String(row.id),
          taskKey: String(row.task_key),
          entityType: String(row.entity_type),
          entityId: String(row.entity_id),
          taskType: String(row.task_type),
          status: String(row.status),
          assignedTo: row.assigned_to ? String(row.assigned_to) : null,
          dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
          completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
          outcome: row.outcome ?? {},
          createdAt: new Date(String(row.created_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
          intakeKey: row.intake_key ? String(row.intake_key) : null,
          caseKey: row.case_key ? String(row.case_key) : null,
          priority: row.intake_priority ? String(row.intake_priority) : row.case_priority ? String(row.case_priority) : null,
          seriousnessStatus: row.intake_seriousness_status
            ? String(row.intake_seriousness_status)
            : row.case_seriousness_status
              ? String(row.case_seriousness_status)
              : null,
          triageOutcome: row.triage_outcome ? String(row.triage_outcome) : null,
          caseRelationship: row.case_relationship ? String(row.case_relationship) : null,
          caseStatus: row.case_status ? String(row.case_status) : null,
        })),
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
