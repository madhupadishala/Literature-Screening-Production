import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8");

const search = read("lib/literature/search/search-strategy-engine.ts");
assert.ok(search.includes("searchExecutionError?: string"));
assert.ok(search.includes('result.searchExecutionError = "PUBMED_EXECUTION_FAILED"'));
assert.ok(search.includes("result.searchExecuted = false;"));

const retry = read("lib/literature/hits/production-search-to-hits-service.ts");
const claim = retry.slice(retry.indexOf("export async function retryProductionHits("));
assert.ok(claim.includes("UPDATE literature_workflow_state workflow"));
assert.ok(claim.includes("workflow.workflow_state = 'HITS_REVIEW'"));
assert.ok(claim.includes("workflow_state = 'HITS_RUNNING'"));
assert.ok(claim.includes("latest_result.result_payload->>'status' = 'HITS_EXECUTION_FAILED'"));
assert.ok(claim.includes("package.tenant_id = $2"));
assert.ok(claim.indexOf("UPDATE literature_workflow_state workflow") < claim.indexOf("return processPackage"));

const screening = read("lib/literature/screening/screening-workflow-service.ts");
assert.ok(screening.includes('row.workflow_state !== "HITS_COMPLETE"'));
assert.ok(screening.includes("FOR UPDATE"));
assert.ok(screening.includes("ON CONFLICT (tenant_id, package_id, screening_result_id)"));

const governance = read("lib/literature/intake-input/intake-input-governance.ts");
assert.ok(governance.includes('input.mrReviewStatus !== "APPROVED"'));
assert.ok(governance.includes('input.screeningFinalDecision !== "INCLUDE"'));
console.log("Sprint 3.2 source-contract regression checks passed (not database integration tests).");
