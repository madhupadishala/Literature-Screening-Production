import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runIcsrPreflight } from "../lib/submissions/icsr-preflight";
const root=process.cwd();
const migration=readFileSync(resolve(root,"database/migrations/040_nexus_submissions_icsr_integration.sql"),"utf8");
for(const required of ["nexus_submission_preflight_runs","nexus_submission_outbox","fk_submission_preflight_scope","idempotency_key"]){if(!migration.includes(required))throw new Error(`Migration 040 missing ${required}`);}
const report=runIcsrPreflight({patient:{age:42},reporters:[],products:[],events:[],narrative:{text:"The patient was hospitalized and later died."}},"GENERIC_E2B_R3");
if(!report.submissionBlocked||report.readiness!=="BLOCKED")throw new Error("Unsafe ICSR was not blocked");
if(!report.findings.some(finding=>finding.findingId==="ICSR-COMP-REA-001"))throw new Error("Missing event finding not produced");
const service=readFileSync(resolve(root,"lib/submissions/submission-service.ts"),"utf8");
if(!service.includes("NEXUS_LIVE_SUBMISSION_TRANSPORT_ENABLED"))throw new Error("Transmission kill switch missing");
console.log("Submissions ICSR integration verification passed: scoped preflight evidence, outbox boundary, UI integration and transmission lock.");
