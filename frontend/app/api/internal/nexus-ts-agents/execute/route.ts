import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { aiProviderFactory } from "@/lib/ai/provider-factory";
import { runCOI } from "@/lib/ai/coi/coi-agent";
import { deterministicNarrativeDraft } from "@/lib/safety/case-processing/case-assist";
import { evaluateTriageSnapshot } from "@/lib/safety/triage/triage-evaluator";
import type { CaseDraftPayload } from "@/lib/safety/case-processing/case-processing-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Input = z.object({
  agent_id: z.enum(["AG08","AG12","AG17","AG20","AG26"]),
  tenant_id: z.string().min(1).max(256),
  client_id: z.string().min(1).max(256),
  document_id: z.string().min(1).max(256),
  job_id: z.string().min(1).max(256),
  text: z.string().min(1).max(100000),
  specialist_input: z.record(z.string(), z.unknown()).optional(),
  governed_knowledge: z.object({
    tenant_id: z.string(), client_id: z.string(),
    manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    citations: z.array(z.object({
      citationId: z.string(), repositoryManifestSha256: z.string(),
    }).passthrough()).max(30),
    products: z.array(z.unknown()).max(500),
    passages: z.array(z.object({ citationId: z.string(), text: z.string(), clientId: z.string().optional() }).passthrough()).max(30).optional(),
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
    if (process.env.NEXUS_TS_AGENT_BRIDGE_ENABLED !== "true") {
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
    const details=input.specialist_input ?? {};
    let specialistResult: unknown;
    if (input.agent_id==="AG08") {
      if (process.env.NEXUS_PV_PII_PROVIDER_APPROVED !== "true" || input.text.length>48000) {
        return Response.json({error:"approved_coi_provider_required"},{status:503});
      }
      specialistResult=await runCOI([
        {id:input.document_id,text:input.text,locator:"authorized_nexus_source"},
      ],aiProviderFactory.getProvider(),input.job_id);
    } else if (input.agent_id==="AG12") {
      const event=details.reportedEvent;
      if(typeof event!=="string" || !event.trim() ||
          !input.text.toLowerCase().includes(event.toLowerCase())) {
        return Response.json({error:"source_grounded_event_required"},{status:422});
      }
      const citations=new Map(kb.citations.map(c=>[c.citationId,c]));
      const labelEvidence=(kb.passages??[]).filter(p=>
        p.clientId===input.client_id &&
        citations.has(p.citationId) &&
        String(citations.get(p.citationId)?.domain??"").toLowerCase()==="labeling"
      ).map(p=>({text:p.text,documentId:p.citationId}));
      if(!labelEvidence.length) return Response.json(
        {error:"approved_client_specific_labeling_missing"},{status:422});
      const { assessListedness }=await import(
        "../../../../../../Agentic_AI/AG12_Listedness_Expectedness/src/branches/consolidate__nexus-shared-agents/platform/shared-agents/candidates/listedness/listedness-engine"
      );
      specialistResult=assessListedness({reportedEvent:event,labelEvidence});
    } else if (input.agent_id==="AG17") {
      const source=details.safety;
      const shape=z.object({
        sourceCoverage:z.enum(["TITLE_ONLY","ABSTRACT_ONLY","FULL_TEXT"]),
        publicationType:z.string(),
        humanPopulation:z.enum(["PRESENT","ABSENT","UNRESOLVED","CONFLICTING"]),
        identifiablePatient:z.enum(["PRESENT","ABSENT","UNRESOLVED","CONFLICTING"]),
        adverseEventOrReaction:z.enum(["PRESENT","ABSENT","UNRESOLVED","CONFLICTING"]),
        products:z.array(z.object({product:z.string(),role:z.string(),
          eventRelation:z.string(),authorCausality:z.string()}).passthrough()).max(100),
        specialSituations:z.array(z.object({type:z.string(),
          products:z.array(z.string()),evidence:z.array(z.object({text:z.string()}).passthrough())}).passthrough()).max(100),
      }).passthrough();
      const checked=shape.safeParse(source);
      if(!checked.success) return Response.json({error:"structured_safety_input_required"},{status:422});
      const { assessPvSafety }=await import(
        "../../../../../../Agentic_AI/AG17_Safety_Information_Detection/src/branches/feat__pv-safety-assessment-engine-v1/frontend/lib/pv-safety-assessment/assessment-engine"
      );
      const data=checked.data as unknown as Parameters<typeof assessPvSafety>[0];
      specialistResult=assessPvSafety(data);
    } else if (input.agent_id==="AG20") {
      const draft=details.caseDraft;
      if(!draft || typeof draft!=="object" || Array.isArray(draft)) {
        return Response.json({error:"structured_case_draft_required"},{status:422});
      }
      const value=draft as Record<string,unknown>;
      if(!value.patient || !Array.isArray(value.products) ||
          !Array.isArray(value.events) || !Array.isArray(value.reporters) ||
          !value.identification) {
        return Response.json({error:"invalid_case_draft"},{status:422});
      }
      specialistResult={draftText:deterministicNarrativeDraft(
        draft as CaseDraftPayload),persisted:false,reviewRequired:true};
    } else {
      const snapshot=details.snapshot;
      if(!snapshot || typeof snapshot!=="object" || Array.isArray(snapshot)) {
        return Response.json({error:"structured_triage_snapshot_required"},{status:422});
      }
      const value=snapshot as Record<string,unknown>;
      if(!["patients","reporters","products","events"].every(
        k=>Array.isArray(value[k]))) {
        return Response.json({error:"incomplete_triage_snapshot"},{status:422});
      }
      specialistResult=evaluateTriageSnapshot(value as Parameters<typeof evaluateTriageSnapshot>[0]);
    }
    return Response.json({
      agent_id:input.agent_id,document_id:input.document_id,
      status:"review_required",review_required:true,
      auto_release_allowed:false,
      knowledge_manifest_sha256:kb.manifest_sha256,
      specialist_result:specialistResult,
    },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({error:"agent_execution_failed",review_required:true},{status:503});
  }
}
