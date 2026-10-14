import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { aiProviderFactory } from "@/lib/ai/provider-factory";
import { runCOI } from "@/lib/ai/coi/coi-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({
  agent_id: z.literal("AG08"),
  tenant_id: z.string().min(1).max(256),
  client_id: z.string().min(1).max(256),
  document_id: z.string().min(1).max(256),
  job_id: z.string().min(1).max(256),
  text: z.string().min(1).max(48000),
  governed_knowledge: z.object({
    tenant_id: z.string(), client_id: z.string(),
    manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    citations: z.array(z.object({
      citationId: z.string(), repositoryManifestSha256: z.string(),
    }).passthrough()).max(30),
    products: z.array(z.unknown()).max(500),
  }).passthrough(),
}).strict();

function authorizedBearer(header: string | null, tenant: string, client: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  let scopes: Record<string, {tenantId: string; clientId: string}>;
  try {
    scopes = JSON.parse(process.env.NEXUS_TS_AGENT_MACHINE_SCOPES_JSON ?? "{}");
  } catch { return false; }
  const provided = createHash("sha256").update(header.slice(7)).digest();
  return Object.entries(scopes).some(([token, scope]) =>
    token.length >= 32 &&
    timingSafeEqual(createHash("sha256").update(token).digest(), provided) &&
    scope.tenantId === tenant && scope.clientId === client
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (process.env.NEXUS_TS_AGENT_BRIDGE_ENABLED !== "true" ||
        process.env.NEXUS_PV_PII_PROVIDER_APPROVED !== "true") {
      return Response.json({error:"agent_bridge_disabled"},{status:503});
    }
    const size = Number(request.headers.get("content-length") ?? "0");
    if (size > 200000) return Response.json({error:"payload_too_large"},{status:413});
    const parsed = Input.safeParse(await request.json());
    if (!parsed.success) return Response.json({error:"invalid_payload"},{status:422});
    const input=parsed.data;
    if (!authorizedBearer(request.headers.get("authorization"),input.tenant_id,input.client_id)) {
      return Response.json({error:"forbidden"},{status:403});
    }
    const kb=input.governed_knowledge;
    if(kb.tenant_id!==input.tenant_id || kb.client_id!==input.client_id ||
       kb.citations.some(c=>c.repositoryManifestSha256!==kb.manifest_sha256)) {
      return Response.json({error:"unverified_kb_scope"},{status:403});
    }
    const result=await runCOI([
      {id:input.document_id,text:input.text,locator:"authorized_nexus_source"}
    ],aiProviderFactory.getProvider(),input.job_id);
    return Response.json({
      agent_id:"AG08",document_id:input.document_id,
      status:"review_required",review_required:true,
      auto_release_allowed:false,
      knowledge_manifest_sha256:kb.manifest_sha256,
      specialist_result:result,
    },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({error:"agent_execution_failed",review_required:true},{status:503});
  }
}
