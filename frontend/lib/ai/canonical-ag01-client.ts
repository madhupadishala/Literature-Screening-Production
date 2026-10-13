import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { buildAgentContextPack } from "@/lib/knowledge/retrieval/controlled-knowledge-service";

type VerifiedNexusJob = {
  principal: { tenantId: string; workspaceId: string; userId: string };
  module: "literature_screening" | "intake_triage" | "case_processing" | "submissions";
  /** Must be authorized against its tenant/client and document storage BEFORE calling this function. */
  authorizedDocumentId: string;
  text: string;
  sourceType: string;
};

function canonical(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")));
}

/** Server-side only. A separately validated Nexus document authorization is mandatory. */
export async function invokeCanonicalAG01(job: VerifiedNexusJob) {
  if (process.env.NEXUS_CANONICAL_AGENTS_ENABLED !== "true") {
    throw new Error("Canonical agents are not enabled");
  }
  const url = process.env.NEXUS_CANONICAL_AGENT_URL;
  const machineToken = process.env.NEXUS_CANONICAL_AGENT_MACHINE_TOKEN;
  const signingSecret = process.env.NEXUS_AGENT_CONTEXT_SIGNING_SECRET;
  if (!url || !machineToken || !signingSecret || Buffer.byteLength(signingSecret) < 32) {
    throw new Error("Canonical AG01 host configuration incomplete");
  }
  if (!job.principal.tenantId || !job.principal.workspaceId || !job.principal.userId ||
      !job.authorizedDocumentId || !job.text.trim() || job.text.length > 100_000) {
    throw new Error("Invalid authorized AG01 input");
  }
  const context: Record<string, unknown> = {
    tenant_id: job.principal.tenantId,
    client_id: job.principal.workspaceId,
    module_id: job.module,
    document_id: job.authorizedDocumentId,
    workflow_id: randomUUID(),
    job_id: randomUUID(),
    agent_id: "AG01",
    principal_id: job.principal.userId,
    task_type: "extract",
    issued_at: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString("hex"),
  };
  const signature = createHmac("sha256", signingSecret).update(canonical(context), "utf8").digest("hex");
  // Current governed knowledge schema: approved/effective PostgreSQL chunks,
  // versioned manifest and citations, not filesystem tenant JSON or Chroma.
  // The existing controlled repository search is tenant-scoped; it does NOT
  // constitute a client-specific Product Master lookup.
  const governedPack = await buildAgentContextPack({
    tenantId: job.principal.tenantId,
    query: job.text.slice(0, 20000),
    mode: "keyword",
    topK: 8,
    actorId: job.principal.userId,
    requestId: String(context.job_id),
    correlationId: String(context.workflow_id),
  });
  if (governedPack.tenantId !== job.principal.tenantId ||
      !/^[a-f0-9]{64}$/.test(governedPack.repositoryManifestSha256)) {
    throw new Error("Controlled KB identity/manifest mismatch");
  }
  const response = await fetch(url.replace(/\/$/, "") + "/internal/v1/nexus-agents/execute", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + machineToken },
    body: JSON.stringify({
      agent_id: "AG01", envelope: { context, signature },
      payload: { text: job.text, source_type: job.sourceType,
        governed_knowledge: { tenant_id: governedPack.tenantId,
          manifest_sha256: governedPack.repositoryManifestSha256,
          citations: governedPack.citations } },
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Canonical AG01 service rejected request: " + response.status);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid AG01 output");
  const data = value as Record<string, unknown>;
  const routing = data.routing as Record<string, unknown> | undefined;
  if (!routing || Object.keys(context).filter(k => [
    "tenant_id", "client_id", "module_id", "document_id", "workflow_id", "job_id", "agent_id",
  ].includes(k)).some(k => routing[k] !== context[k])) {
    throw new Error("Canonical AG01 result scope mismatch");
  }
  return data;
}
