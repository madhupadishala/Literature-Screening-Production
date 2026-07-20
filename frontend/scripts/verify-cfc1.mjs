import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(frontendRoot, "..");

const checks = [];

function read(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function assertCheck(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

const expectedFiles = [
  "frontend/components/WorkspaceHeader.tsx",
  "frontend/components/Navigation.tsx",
  "frontend/app/api/context/current/route.ts",
  "frontend/app/reports/page.tsx",
  "frontend/app/workflow/page.tsx",
  "frontend/app/workflow/[packageId]/page.tsx",
  "frontend/app/hits/page.tsx",
  "frontend/app/screening/page.tsx",
  "frontend/lib/rbac/permissions.ts",
  "frontend/lib/rbac/request-principal.ts",
];

for (const file of expectedFiles) {
  assertCheck(`File exists: ${file}`, fs.existsSync(path.join(projectRoot, file)));
}

const navigation = read("frontend/components/Navigation.tsx");
const contextRoute = read("frontend/app/api/context/current/route.ts");
const permissions = read("frontend/lib/rbac/permissions.ts");
const workflow = read("frontend/app/workflow/page.tsx");
const workflowDetails = read("frontend/app/workflow/[packageId]/page.tsx");
const screening = read("frontend/app/screening/page.tsx");
const reports = read("frontend/app/reports/page.tsx");
const requestPrincipal = read("frontend/lib/rbac/request-principal.ts");

for (const label of [
  "Dashboard",
  "Literature Search",
  "Workflow",
  "Hits",
  "Screening",
  "Reports",
  "Administration",
]) {
  assertCheck(`Navigation includes ${label}`, navigation.includes(`label: "${label}"`));
}

assertCheck(
  "Navigation is permission-filtered",
  navigation.includes("context.permissions.includes") &&
    navigation.includes("visibleModules"),
);
assertCheck(
  "Context API returns effective permissions",
  contextRoute.includes("getEffectivePermissions") &&
    contextRoute.includes("permissions:"),
);
assertCheck(
  "Context API returns tenant display name",
  contextRoute.includes("tenantDisplayName"),
);
assertCheck(
  "Client-facing RBAC permissions are registered",
  permissions.includes("nexus.dashboard.view") &&
    permissions.includes("tenant.administration.view") &&
    permissions.includes("system.health.view"),
);
assertCheck(
  "Workflow uses authenticated tenant context",
  workflow.includes("tenant_id: tenantKey") &&
    !workflow.includes('tenant_id: "demo-tenant"'),
);
assertCheck(
  "Broken downstream export action removed",
  !screening.includes("/api/screening/export-intake"),
);
assertCheck(
  "Reports placeholder replaced",
  !reports.includes("Reports workspace will be connected here") &&
    reports.includes("Literature Operational Reports"),
);
assertCheck(
  "Package details show governed output terminology",
  workflowDetails.includes("Approved Outcome Template") &&
    !workflowDetails.includes("intake_input.json"),
);
assertCheck(
  "Local bootstrap principal uses neutral naming",
  requestPrincipal.includes("ALLOW_LOCAL_BOOTSTRAP_PRINCIPAL") &&
    !requestPrincipal.includes("ClinixAI Investor Demonstration"),
);

const clientFacingFiles = [
  "frontend/app/page.tsx",
  "frontend/app/admin/page.tsx",
  "frontend/app/hits/page.tsx",
  "frontend/app/literature-search/page.tsx",
  "frontend/app/reports/page.tsx",
  "frontend/app/screening/page.tsx",
  "frontend/app/workflow/page.tsx",
  "frontend/app/workflow/[packageId]/page.tsx",
  "frontend/components/Navigation.tsx",
  "frontend/components/TopBar.tsx",
  "frontend/components/TenantSwitcher.tsx",
  "frontend/components/WorkspaceHeader.tsx",
];

const bannedPatterns = [
  /Project:\s*Demo/i,
  /User:\s*Madhu/i,
  /Validated demonstration/i,
  /Investor Demonstration/i,
  /Demo Tenant/i,
  /Novartis Workspace/i,
  /demo-tenant/i,
];

for (const file of clientFacingFiles) {
  const content = read(file);
  for (const pattern of bannedPatterns) {
    assertCheck(
      `No client-facing placeholder ${pattern} in ${file}`,
      !pattern.test(content),
    );
  }
}

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  const icon = check.passed ? "PASS" : "FAIL";
  console.log(`${icon.padEnd(4)}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
}

console.log("\n============================================================");
console.log(
  failed.length === 0
    ? "CFC-1 STATIC VERIFICATION PASSED"
    : `CFC-1 STATIC VERIFICATION FAILED (${failed.length} check(s))`,
);
console.log("============================================================");

process.exit(failed.length === 0 ? 0 : 1);
