import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateSeriousnessResponse, assessSeriousness } from "../lib/ai/seriousness-agent-client";
import { assessSharedPVAgent } from "../lib/ai/shared-pv-agent-client";

const expected = { tenant_id: "t", client_id: "c", workspace_id: "w", request_id: "r", case_id: "case", input_sha256: "a".repeat(64) };
const valid = { ...expected, execution_id: "e", decision: "needs_review", route: "hitl", criteria_met: [], review_reasons: ["uncertain"], explanation: "Review required", confidence: 0.5, knowledge_version: "v1", evidence_spans: [], audit_id: "audit" };
test("valid uncertain response remains HITL", () => assert.equal(validateSeriousnessResponse(valid, expected).decision, "needs_review"));
for (const [name, patch] of [
  ["foreign tenant", { tenant_id: "other" }], ["wrong hash", { input_sha256: "b".repeat(64) }],
  ["uncertain auto route", { route: "auto" }], ["serious without criteria", { decision: "serious" }],
  ["malformed reasons", { review_reasons: "none" }], ["missing audit", { audit_id: null }],
  ["invalid confidence", { confidence: NaN }], ["nonserious with serious criteria", { decision: "non_serious", criteria_met: ["death"] }],
] as const) test(`reject ${name}`, () => assert.throws(() => validateSeriousnessResponse({ ...valid, ...patch }, expected)));

test("seriousness caller correlates exact narrative hash and scope", async () => {
  process.env.NEXUS_SERIOUSNESS_ENABLED = "true"; process.env.NEXUS_SERIOUSNESS_AGENT_URL = "https://service.invalid";
  const prior = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = String(options?.body); const payload = JSON.parse(body);
    const hash = createHash("sha256").update(payload.narrative).digest("hex");
    assert.equal((options?.headers as Record<string,string>)["x-input-sha256"], hash);
    return Response.json({ ...valid, ...payload, input_sha256: hash });
  };
  try { assert.equal((await assessSeriousness({ tenant_id: "t", client_id: "c", workspace_id: "w", case_id: "case", narrative: "source", event_terms: [] }, { bearerToken: "fixture" })).route, "hitl"); }
  finally { globalThis.fetch = prior; delete process.env.NEXUS_SERIOUSNESS_ENABLED; delete process.env.NEXUS_SERIOUSNESS_AGENT_URL; }
});

test("shared client rejects scope mismatch", async () => {
  process.env.NEXUS_DRUG_ROLE_ENABLED="true";process.env.NEXUS_PV_AGENT_URL="https://service.invalid";process.env.NEXUS_PV_AGENT_TOKEN="fixture";
  const prior=globalThis.fetch;
  globalThis.fetch=async (_url, options) => Response.json({ ...JSON.parse(String(options?.body)), tenant_id:"foreign" });
  try { await assert.rejects(assessSharedPVAgent("drug-role", {tenant_id:"t",client_id:"c",workspace_id:"w",case_id:"case",narrative:"source",source_type:"spontaneous",event_terms:[]}),/scope/); }
  finally { globalThis.fetch=prior;delete process.env.NEXUS_DRUG_ROLE_ENABLED;delete process.env.NEXUS_PV_AGENT_URL;delete process.env.NEXUS_PV_AGENT_TOKEN; }
});
