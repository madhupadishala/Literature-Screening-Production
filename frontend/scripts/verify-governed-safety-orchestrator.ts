import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assessGovernedSafety, SAFETY_AGENT_NAMES } from "../lib/pv-safety-assessment/governed-orchestrator";
import type { GovernedSafetyRequest } from "../lib/pv-safety-assessment/governed-orchestrator";
const text="Patient reported rash after medicine.";
const hash=createHash("sha256").update(text).digest("hex");
const base: GovernedSafetyRequest={
  tenantId:"tenant-a",clientId:"client-a",caseId:"ICSR-1",
  sources:[{id:"S1",text,sha256:hash}],
  knowledge:{tenantId:"tenant-a",clientId:"client-a",id:"PV-CORE",version:"v1",status:"APPROVED"},
  screeningInput:{
    sourceCoverage:"FULL_TEXT",publicationType:"SPONTANEOUS",
    humanPopulation:"PRESENT",identifiablePatient:"PRESENT",adverseEventOrReaction:"PRESENT",
    eventEvidence:[{text:"rash"}],products:[],specialSituations:[],
  },
  decisions:SAFETY_AGENT_NAMES.map(agent=>({
    agent,tenantId:"tenant-a",clientId:"client-a",status:"SUPPORTED" as const,
    knowledgeId:"PV-CORE",knowledgeVersion:"v1",
    evidence:[{sourceId:"S1",start:0,end:text.length,quote:text}],
    payload:{},
  })),
};
const result=assessGovernedSafety(base);
assert.equal(result.assessment.safetyRelevance,"CASE_SAFETY");
assert.equal(result.disposition,"MEDICAL_REVIEW_REQUIRED");
assert.equal(result.autonomousReleaseAllowed,false);
assert.equal(result.decisions.length,6);
assert.match(result.auditDigest,/^[a-f0-9]{64}$/);
assert.throws(()=>assessGovernedSafety({...base,decisions:base.decisions.map(d=>({...d,tenantId:"other"}))}),/CROSS_TENANT/);
assert.throws(()=>assessGovernedSafety({...base,sources:[{...base.sources[0],sha256:"f".repeat(64)}]}),/Unverified source/);
const incomplete=assessGovernedSafety({...base,decisions:base.decisions.slice(1)});
assert.ok(incomplete.issues.includes("drug:MISSING_OR_DUPLICATE"));
const falseSpan=assessGovernedSafety({...base,decisions:base.decisions.map(d=>({...d,evidence:[{sourceId:"S1",start:0,end:7,quote:"fiction"}]}))});
assert.ok(falseSpan.issues.some(issue=>issue.includes("INVALID_EVIDENCE")));
const unapproved=assessGovernedSafety({...base,knowledge:{...base.knowledge,status:"DRAFT"}});
assert.ok(unapproved.issues.includes("KNOWLEDGE_NOT_APPROVED"));
console.log("Governed Safety orchestrator: six-agent contract and isolation scenarios passed");
