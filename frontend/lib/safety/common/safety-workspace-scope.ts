import "server-only";

import type { Pool, PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

export interface SafetyWorkspaceScope {
  workspaceId: string;
  environment: NexusEnvironment;
}

export function requireSafetyWorkspaceScope(
  principal: RequestPrincipal,
): SafetyWorkspaceScope {
  const candidate = principal as RequestPrincipal & {
    workspaceId?: unknown;
    environment?: unknown;
  };

  if (
    typeof candidate.workspaceId !== "string" ||
    !candidate.workspaceId.trim()
  ) {
    throw new Error(
      "A server-authorized client workspace is required for regulated Safety data.",
    );
  }

  return {
    workspaceId: candidate.workspaceId.trim(),
    environment: principal.environment,
  };
}

type Queryable = Pick<Pool | PoolClient, "query">;

async function assertResourceScope(input: {
  db: Queryable;
  table: "safety_intake_records" | "safety_cases";
  principal: RequestPrincipal;
  resourceId: string;
  label: string;
}): Promise<void> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  const resourceId = input.resourceId.trim();
  if (!resourceId) throw new Error(`${input.label} identifier is required.`);

  const result = await input.db.query(
    `SELECT id
       FROM ${input.table}
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND environment = $3
        AND id = $4
      LIMIT 1`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      resourceId,
    ],
  );

  if (!result.rows[0]) {
    throw new Error(
      `${input.label} was not found in the selected client workspace/environment.`,
    );
  }
}

export async function assertSafetyIntakeInScope(
  principal: RequestPrincipal,
  intakeRecordId: string,
  db: Queryable = getPostgresPool(),
): Promise<void> {
  return assertResourceScope({
    db,
    table: "safety_intake_records",
    principal,
    resourceId: intakeRecordId,
    label: "Safety intake record",
  });
}

export async function assertSafetyCaseInScope(
  principal: RequestPrincipal,
  caseId: string,
  db: Queryable = getPostgresPool(),
): Promise<void> {
  return assertResourceScope({
    db,
    table: "safety_cases",
    principal,
    resourceId: caseId,
    label: "Safety case",
  });
}
