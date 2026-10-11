import assert from "node:assert/strict";
import { requestSharedAgentSuggestion, SharedAgentUnavailable } from "../lib/ai/shared-pv-agent-adapter";

const input = {agent:"seriousness" as const, tenantId:"tenant-a",clientId:"client-a",workspaceId:"workspace-a",caseId:"case-a",narrative:"The patient was hospitalized."};
await assert.rejects(requestSharedAgentSuggestion(input), SharedAgentUnavailable);
const opts={enabled:true,endpoint:"https://agents.example.test",token:"test-only-token"};
await assert.rejects(requestSharedAgentSuggestion(input,{...opts,fetcher:async ()=>new Response(null,{status:503}) as Response}),SharedAgentUnavailable);
const fn:typeof fetch=async (_url,init)=>{
  const request=JSON.parse(String(init?.body));
  assert.equal(request.tenant_id,"tenant-a");
  assert.equal(request.workspace_id,"workspace-a");
  return new Response(JSON.stringify({
    schema_version:"nexus.pv-agent/1",agent:"seriousness",tenant_id:"tenant-a",
    client_id:"client-a",workspace_id:"workspace-a",case_id:"case-a",
    request_id:request.request_id,input_sha256:request.input_sha256,route:"hitl",
    review_required:true,confidence:0.5,knowledge_version:"kb-1",
    evidence_spans:[{start:16,end:28,text:"hospitalized"}],result:{status:"REVIEW_REQUIRED"}
  }),{status:200,headers:{"content-type":"application/json"}});
};
const response=await requestSharedAgentSuggestion(input,{...opts,fetcher:fn});
assert.equal(response.review_required,true);
assert.equal(response.knowledge_version,"kb-1");
const spoof:typeof fetch=async (url,init)=>{
  const request=JSON.parse(String(init?.body));
  return new Response(JSON.stringify({
    schema_version:"nexus.pv-agent/1",agent:"seriousness",tenant_id:"tenant-b",
    client_id:"client-a",workspace_id:"workspace-a",case_id:"case-a",
    request_id:request.request_id,input_sha256:request.input_sha256,route:"hitl",
    review_required:true,confidence:0.5,knowledge_version:"kb-1",evidence_spans:[],result:{}
  }),{status:200});
};
await assert.rejects(requestSharedAgentSuggestion(input,{...opts,fetcher:spoof}),SharedAgentUnavailable);
await assert.rejects(requestSharedAgentSuggestion(input,{...opts,endpoint:"http://agents.example.test",fetcher:fn}),SharedAgentUnavailable);
console.log("Nexus shared agent contract tests passed.");
