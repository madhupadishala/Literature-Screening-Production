import { type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { invokeCanonicalAgent } from "@/lib/ai/canonical-agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connected = ["AG01", "AG07", "AG16", "AG25", "AG27"] as const;
const Input = z.object({documentId: z.string().uuid(), agentId: z.enum(connected)}).strict();

/** Executes AG01 against an existing, authorized Nexus intake source document.
 * Non-text uploads must first pass the governed text extraction workflow.
 * No user-supplied document text or workspace selection is trusted.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (process.env.NEXUS_CANONICAL_AGENTS_ENABLED !== "true") {
      return Response.json({error: "Shared agent execution disabled pending qualification"}, {status: 503});
    }
    const principal = await requireWorkspaceModulePermission(
      request, NEXUS_MODULES.INTAKE, PERMISSIONS.INTAKE_PROCESS,
    );
    const input = Input.safeParse(await request.json());
    if (!input.success) {
      return Response.json({error: "Invalid document ID"}, {status: 422});
    }
    const {rows} = await getPostgresPool().query<{
      id: string; content_bytes: Buffer; content_sha256: string; content_type: string;
    }>(
      `SELECT d.id, d.content_bytes, d.content_sha256, d.content_type
         FROM safety_source_documents d
         JOIN safety_intake_records i
           ON i.id = d.intake_record_id AND i.tenant_id = d.tenant_id
        WHERE d.id = $1 AND d.tenant_id = $2
          AND i.workspace_id = $3 AND i.environment = $4
          AND d.content_type = 'text/plain'
        LIMIT 1`,
      [input.data.documentId, principal.tenantId, principal.workspaceId, principal.environment],
    );
    const document = rows[0];
    if (!document) {
      return Response.json({error: "Authorized plain-text source not found"}, {status: 404});
    }
    const bytes = document.content_bytes;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 100_000 ||
        createHash("sha256").update(bytes).digest("hex") !== document.content_sha256) {
      return Response.json({error: "Source integrity or extraction requirement failed"}, {status: 422});
    }
    const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    const result = await invokeCanonicalAgent({
      agentId: input.data.agentId,
      principal: {tenantId: principal.tenantId, workspaceId: principal.workspaceId, userId: principal.userId},
      module: "intake_triage",
      authorizedDocumentId: document.id,
      text,
      sourceType: "spontaneous",
    });
    return Response.json({success: true, data: result}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return routeErrorResponse(error);
  }
}
