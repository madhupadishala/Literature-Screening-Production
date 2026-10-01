import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; import path from "node:path";
const read=(p:string)=>readFileSync(path.join(process.cwd(),p),"utf8");
const m=read("database/migrations/037_nexus_aggregate_reporting_foundation.sql");
for(const t of ["nexus_aggregate_reports","nexus_aggregate_report_versions","source_sha256","content_sha256","fk_aggregate_version_scope"])assert.ok(m.includes(t),t);
const s=read("lib/aggregate/aggregate-service.ts");
for(const t of ["case_status IN ('FINALIZED','SUBMITTED','CLOSED')","final_version_id","caseSha256","canonicalSha256","workspace_id=$2","environment=$3","Finalized aggregate report cannot be edited in place","client.query(\"BEGIN\")","AGGREGATE_REPORT_CREATED"])assert.ok(s.includes(t),t);
for(const r of ["app/api/aggregate-reports/route.ts","app/api/aggregate-reports/[reportId]/route.ts","app/api/aggregate-reports/[reportId]/versions/route.ts"]){const x=read(r);assert.ok(x.includes("requireWorkspaceModulePermission"),r);assert.ok(x.includes("NEXUS_MODULES.AGGREGATE_REPORTING"),r);}
for(const d of ["../docs/benchmarks/BENCHMARK_AGGREGATE_REPORTING.md","../docs/requirements/URS/URS_AGGREGATE_REPORTING.md","../docs/requirements/FRS/FRS_AGGREGATE_REPORTING.md","../docs/user-guides/USER_GUIDE_AGGREGATE_REPORTING.md"])assert.ok(read(d).length>500,d);
console.log("Cleanup Sprint 9 Aggregate Reporting foundation verification passed.");
