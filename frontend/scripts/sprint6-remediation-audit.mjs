const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const token = process.env.INTERNAL_MONITORING_TOKEN;

if (!token) {
  console.error("INTERNAL_MONITORING_TOKEN is missing. Run with --env-file=.env.local.");
  process.exit(2);
}

const technicalEndpoints = [
  ["Enterprise readiness", "/api/health/ready"],
  ["Dependency health", "/api/health/dependencies"],
  ["AI self-test", "/api/ai/self-test"],
  ["System readiness consistency", "/api/system/readiness"],
  ["Platform health consistency", "/api/system/platform-health"],
  ["Database readiness", "/api/system/db-health"],
];

const results = [];

for (const [name, pathname] of technicalEndpoints) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: {
        accept: "application/json",
        "x-monitoring-token": token,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 1000);
    }

    results.push({
      name,
      pathname,
      passed: response.ok,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - started),
      body,
    });
  } catch (error) {
    results.push({
      name,
      pathname,
      passed: false,
      statusCode: 0,
      latencyMs: Math.round(performance.now() - started),
      body: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log("\nSPRINT 6 TECHNICAL REMEDIATION AUDIT\n");
console.table(
  results.map(({ name, passed, statusCode, latencyMs }) => ({
    Test: name,
    Status: passed ? "PASSED" : "FAILED",
    HTTP: statusCode,
    LatencyMs: latencyMs,
  })),
);

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.log("\nFAILED TECHNICAL CHECK DETAILS\n");
  for (const result of failed) {
    console.log(`--- ${result.name} (${result.pathname}) ---`);
    console.log(JSON.stringify(result.body, null, 2));
  }
}

try {
  const response = await fetch(`${baseUrl}/api/release/status`, {
    headers: {
      accept: "application/json",
      "x-monitoring-token": token,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();
  const gates = body?.data?.gates || body?.gates || [];
  if (Array.isArray(gates) && gates.length > 0) {
    console.log("\nCURRENT RELEASE GATES\n");
    console.table(
      gates.map((gate) => ({
        Gate: gate.title,
        Status: gate.status,
        Mandatory: Boolean(gate.mandatory),
        Message: gate.message,
      })),
    );
  }
} catch (error) {
  console.warn("Release gate report could not be loaded:", error instanceof Error ? error.message : error);
}

if (failed.length > 0) {
  console.error(`\nTechnical remediation is NOT passed: ${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log("\nAll Sprint 6 technical remediation checks passed.");
console.log("Manual PV UAT and the release checklist still require controlled human evidence.");
