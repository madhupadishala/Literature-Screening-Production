import "server-only";

import { canonicalSha256 } from "./canonical-json";
import { validateE2BR3CasePayload } from "./safety-validation";
import type { E2BR3CasePayload } from "./safety-types";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

export type CaseVersionType = "INITIAL" | "FOLLOW_UP" | "CORRECTION" | "NULLIFICATION";

export interface CaseVersionSummary {
  caseVersionId: string;
  caseId: string;
  version: number;
  versionType: CaseVersionType;
  caseSha256: string;
  createdAt: string;
}

function validateReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 10) {
    throw new Error("A case-version change reason of at least 10 characters is required.");
  }
  return normalized;
}

export async function createSafetyCaseVersion(input: {
  principal: RequestPrincipal;
  caseId: string;
  versionType: CaseVersionType;
  payload: E2BR3CasePayload;
  reason: string;
}): Promise<CaseVersionSummary> {
  const caseId = input.caseId.trim();
  if (!caseId) throw new Error("caseId is required.");
  const reason = validateReason(input.reason);
  const payload = validateE2BR3CasePayload(input.payload);

  if (payload.nexus.tenantId !== input.principal.tenantId) {
    throw new Error("Case payload tenant does not match the active tenant.");
  }
  if (payload.nexus.caseId !== caseId) {
    throw new Error("Case payload caseId does not match the requested case.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const selected = await client.query<{
      id: string;
      case_key: string;
      intake_record_id: string;
      current_version: number;
    }>(
      `SELECT id, case_key, intake_record_id, current_version
         FROM safety_cases
        WHERE tenant_id = $1
          AND id = $2
        FOR UPDATE`,
      [input.principal.tenantId, caseId],
    );

    const safetyCase = selected.rows[0];
    if (!safetyCase) throw new Error("Safety case was not found in the active tenant.");

    const nextVersion = Number(safetyCase.current_version) + 1;
    if (nextVersion === 1 && input.versionType !== "INITIAL") {
      throw new Error("The first case version must use versionType INITIAL.");
    }
    if (nextVersion > 1 && input.versionType === "INITIAL") {
      throw new Error("INITIAL may only be used for the first case version.");
    }
    if (payload.nexus.version !== nextVersion) {
      throw new Error(
        "Case payload version does not match the next immutable case version.",
      );
    }
    if (payload.nexus.caseKey !== safetyCase.case_key) {
      throw new Error("Case payload caseKey does not match the stored case.");
    }
    if (payload.nexus.intakeRecordId !== safetyCase.intake_record_id) {
      throw new Error("Case payload intake lineage does not match the stored case.");
    }

    const caseSha256 = canonicalSha256(payload);
    const inserted = await client.query<{
      id: string;
      created_at: string;
    }>(
      `INSERT INTO safety_case_versions (
         tenant_id, case_id, version, version_type, e2b_profile,
         schema_version, case_payload, case_sha256, change_reason, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       RETURNING id, created_at::text`,
      [
        input.principal.tenantId,
        caseId,
        nextVersion,
        input.versionType,
        payload.profile,
        payload.schemaVersion,
        JSON.stringify(payload),
        caseSha256,
        reason,
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE safety_cases
          SET current_version = $3,
              updated_by = $4,
              updated_at = now()
        WHERE tenant_id = $1
          AND id = $2`,
      [
        input.principal.tenantId,
        caseId,
        nextVersion,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SAFETY_CASE_VERSION_CREATED',
         'NEXUS_CASE_VERSIONING','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId,
          version: nextVersion,
          versionType: input.versionType,
          caseSha256,
          reason,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      caseVersionId: inserted.rows[0].id,
      caseId,
      version: nextVersion,
      versionType: input.versionType,
      caseSha256,
      createdAt: new Date(inserted.rows[0].created_at).toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
