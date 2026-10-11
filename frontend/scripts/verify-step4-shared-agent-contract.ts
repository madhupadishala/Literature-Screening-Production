import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  requireAgentRequest, validateAgentSuggestion, PV_AGENT_SCHEMA,
  type ScopedAgentRequest,
} from "../lib/literature/shared-agents/shared-agent-contract";

const narrative="Patient hospitalized with severe headache.";
const req:ScopedAgentRequest = {
  tenant_id:"tenant-a", client_id:"client-a", workspace_id:"client-a",
  request_id:"test-001",case_id:"case-001",narrative,
  input_sha256:createHash("sha256").update(narrative).digest("hex"),
};
const suggestion={
  schema_version:PV_AGENT_SCHEMA,agent:"seriousness",
  tenant_id:req.tenant_id,client_id:req.client_id,workspace_id:req.workspace_id,
  request_id:req.request_id,case_id:req.case_id,input_sha256:req.input_sha256,
  route:"hitl",review_required:true,confidence:0.6,
  knowledge_version:"test-kb-1",audit_id:"audit-1",
  evidence_spans:[{start:8,end:20,text:"hospitalized"}],result:{decision:"needs_review"},
};
requireAgentRequest(req);
assert.equal(validateAgentSuggestion(suggestion,"seriousness",req).route,"hitl");
for (const altered of [
  {...suggestion,tenant_id:"tenant-b"},
  {...suggestion,workspace_id:"client-b"},
  {...suggestion,client_id:"client-b"},
  {...suggestion,case_id:"wrong-case"},
  {...suggestion,review_required:false},
  {...suggestion,route:"auto-release"},
  {...suggestion,knowledge_version:""},
  {...suggestion,confidence:NaN},
  {...suggestion,evidence_spans:[{start:8,end:20,text:"not-in-source"}]},
  {...suggestion,input_sha256:"f".repeat(64)},
  {...suggestion,schema_version:"unapproved"},
]) {
  assert.throws(()=>validateAgentSuggestion(altered,"seriousness",req));
}
assert.throws(()=>requireAgentRequest({...req,tenant_id:""}));
assert.throws(()=>requireAgentRequest({...req,narrative:"x".repeat(50001)}));
console.log("Step 4 shared PV agent contract negative verification passed.");
