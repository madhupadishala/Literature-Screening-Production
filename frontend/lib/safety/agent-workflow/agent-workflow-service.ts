import "server-only";
import { createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";
import { ensureInitialDraft } from "@/lib/safety/case-processing/case-processing-service";
import { createSafetyCaseShellInTransaction } from "@/lib/safety/common/safety-case-service";

export type AgentBatch = { tenantKey: string; workspaceId: string; environment: string; documentId: string;
  sourceSha256: string; outcomes: Record<string, { status: "review_required"; assessment: Record<string, unknown> }> };
export type AgentExecutor = (request: Record<string, unknown>) => Promise<AgentBatch>;

async function executeRemote(request: Record<string, unknown>): Promise<AgentBatch> {
  const endpoint = process.env.NEXUS_PV_WORKFLOW_URL;
  const token = process.env.NEXUS_PV_WORKFLOW_TOKEN;
  if (!endpoint || !token) throw new Error("Approved agent workflow service is not configured.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid private workflow endpoint.");
  const response = await fetch(url, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(120_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
  if (!response.ok) throw new Error(`Agent workflow service unavailable (${response.status}).`);
  return await response.json() as AgentBatch;
}

/** Caller must provide the live workspace principal from the same resolver as /api/context/current. */
export async function runDocumentAgentWorkflow(input: { principal: RequestPrincipal; intakeRecordId: string; requestId: string;
  reason: string }, execute: AgentExecutor = executeRemote) {
  const { principal } = input;
  const scope = requireSafetyWorkspaceScope(principal);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId) || input.reason.trim().length < 10) throw new Error("Valid workflow request and reason required.");
  const pool = getPostgresPool();
  const parameters = [principal.tenantId, scope.workspaceId, scope.environment, input.intakeRecordId];
  // Scope is enforced in SQL BEFORE any document is sent to the agent service.
  const found = await pool.query<{ id: string; document_id: string; status: string; extracted_text: string;
    source_sha256: string; language_code: string | null; source_type: string; receipt_party: string | null; patients: unknown[]; reporters: unknown[]; products: Array<{reported_name:string;role_characterization:string}>; events: Array<{reported_term:string}>; initial_receipt_date: string; latest_receipt_date: string }>(
    `SELECT i.id,i.status,i.initial_receipt_date::text,i.latest_receipt_date::text,
            d.id AS document_id,d.extracted_text,d.extracted_text_sha256 AS source_sha256,s.language_code,s.source_type,s.source_payload->'metadata'->>'receivedBy' AS receipt_party,
            COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM safety_patients p WHERE p.tenant_id=i.tenant_id AND p.intake_record_id=i.id),'[]'::jsonb) AS patients,
            COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM safety_reporters p WHERE p.tenant_id=i.tenant_id AND p.intake_record_id=i.id),'[]'::jsonb) AS reporters,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('reported_name',p.reported_name,'role_characterization',p.role_characterization)) FROM safety_products p WHERE p.tenant_id=i.tenant_id AND p.intake_record_id=i.id),'[]'::jsonb) AS products,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('reported_term',e.reported_term)) FROM safety_events e WHERE e.tenant_id=i.tenant_id AND e.intake_record_id=i.id),'[]'::jsonb) AS events
       FROM safety_intake_records i JOIN safety_source_documents d
         ON d.tenant_id=i.tenant_id AND d.intake_record_id=i.id
       JOIN safety_sources s ON s.id=i.source_id AND s.tenant_id=i.tenant_id AND s.workspace_id=i.workspace_id AND s.environment=i.environment
      WHERE i.tenant_id=$1 AND i.workspace_id=$2 AND i.environment=$3 AND i.id=$4
      ORDER BY d.created_at DESC LIMIT 1`, parameters);
  const source = found.rows[0];
  if (!source) throw new Error("Source document was not found in the selected workspace.");
  if (source.status !== "READY_FOR_CASE" && source.status !== "CASE_CREATED") throw new Error("Source review must complete before draft case creation.");
  if (!source.extracted_text || source.extracted_text.length > 100_000) throw new Error("Extracted source text required within workflow budget.");
  const digest = createHash("sha256").update(source.extracted_text).digest("hex");
  if (digest !== source.source_sha256) throw new Error("Source integrity check failed.");
  const prior = await pool.query<{ source_sha256: string; result: Record<string, unknown> }>(
    `SELECT source_sha256,result FROM nexus_agent_workflow_runs WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3 AND request_id=$4`,
    [principal.tenantId, scope.workspaceId, scope.environment, input.requestId]);
  if (prior.rows[0]) {
    if (prior.rows[0].source_sha256 !== digest || prior.rows[0].result.intakeRecordId !== input.intakeRecordId) throw new Error("Workflow idempotency conflict.");
    return prior.rows[0].result;
  }
  const batch = await execute({ tenantKey: principal.tenantKey, workspaceId: scope.workspaceId, environment: scope.environment,
    documentId: source.document_id, requestId: input.requestId, sourceSha256: digest, text: source.extracted_text,
    approvedSource: { patients:source.patients,reporters:source.reporters,products:source.products,events:source.events },
    sourceType: source.source_type, receiptParty: source.receipt_party ?? "unresolved",
    receivedAt: source.initial_receipt_date, sourceLanguage: source.language_code === "en" ? "English" : source.language_code ?? "undetermined" });
  if (batch.tenantKey !== principal.tenantKey || batch.workspaceId !== scope.workspaceId || batch.environment !== scope.environment ||
      batch.documentId !== source.document_id || batch.sourceSha256 !== digest) throw new Error("Agent response scope/source mismatch.");
  const agents = Array.from({ length: 27 }, (_, index) => `AG${String(index + 1).padStart(2, "0")}`);
  if (!batch.outcomes || Object.keys(batch.outcomes).length !== 27 || agents.some(id => batch.outcomes[id]?.status !== "review_required" ||
      !batch.outcomes[id]?.assessment || typeof batch.outcomes[id].assessment !== "object" || Array.isArray(batch.outcomes[id].assessment))) throw new Error("Complete review-only agent batch required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([principal.tenantId,scope.workspaceId,scope.environment,input.requestId])]);
    const existing = await client.query<{ source_sha256: string; result: Record<string, unknown> }>(
      `SELECT source_sha256,result FROM nexus_agent_workflow_runs WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3 AND request_id=$4 FOR UPDATE`,
      [principal.tenantId,scope.workspaceId,scope.environment,input.requestId]);
    if (existing.rows[0]) {
      if (existing.rows[0].source_sha256 !== digest || existing.rows[0].result.intakeRecordId !== input.intakeRecordId) throw new Error("Workflow idempotency conflict.");
      await client.query("COMMIT"); return existing.rows[0].result;
    }
    // Recheck the source under lock after remote execution: content/authorization state may have changed.
    const locked = await client.query<{ extracted_text_sha256: string }>(
      `SELECT d.extracted_text_sha256 FROM safety_intake_records i JOIN safety_source_documents d ON d.tenant_id=i.tenant_id AND d.intake_record_id=i.id
       WHERE i.tenant_id=$1 AND i.workspace_id=$2 AND i.environment=$3 AND i.id=$4 AND d.id=$5 FOR UPDATE OF i,d`, [...parameters,source.document_id]);
    if (locked.rows[0]?.extracted_text_sha256 !== digest) throw new Error("Source changed during agent execution.");
    const safetyCase = await createSafetyCaseShellInTransaction({ client, principal, request: {
      intakeRecordId: input.intakeRecordId, caseKey: `PV-AI-${input.intakeRecordId}`, initialReceiptDate: source.initial_receipt_date,
      latestReceiptDate: source.latest_receipt_date, seriousnessStatus: "UNRESOLVED", reason: input.reason } });
    if (!["NEW","ASSIGNED","PROCESSING","QC_RETURNED"].includes(safetyCase.caseStatus)) throw new Error("Case is not editable for an agent draft.");
    await ensureInitialDraft(client,principal,safetyCase.caseId);
    // This is a review-pending preview, not a finalized version or transmissible E2B package.
    const preview = { caseId: safetyCase.caseId, status: "AWAITING_HUMAN_REVIEW", transmissionEnabled: false, agentResults: batch.outcomes };
    const result = { caseId: safetyCase.caseId, intakeRecordId: input.intakeRecordId, executedSlots: 27,
      tenantKey: principal.tenantKey, workspaceId: scope.workspaceId, environment: scope.environment, sourceSha256: digest,
      status: "PENDING_HUMAN_REVIEW", submissionPreview: preview };
    await client.query(`INSERT INTO nexus_agent_workflow_runs(tenant_id,workspace_id,environment,request_id,intake_record_id,case_id,source_sha256,result,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [principal.tenantId,scope.workspaceId,scope.environment,input.requestId,input.intakeRecordId,safetyCase.caseId,digest,JSON.stringify(result),principal.userId]);
    await client.query(`INSERT INTO audit_events(tenant_id,workspace_id,environment,module_key,actor_id,event_type,event_category,outcome,details)
      VALUES($1,$2,$3,'CASE_PROCESSING',$4,'AGENT_WORKFLOW_DRAFT_STAGED','NEXUS_AGENT_WORKFLOW','success',$5::jsonb)`,
      [principal.tenantId,scope.workspaceId,scope.environment,principal.userId,JSON.stringify({requestId:input.requestId,caseId:safetyCase.caseId,sourceSha256:digest,agents,reviewRequired:true})]);
    await client.query("COMMIT");return result;
  } catch (error) { await client.query("ROLLBACK");throw error; } finally { client.release(); }
}
