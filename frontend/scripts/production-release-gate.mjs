import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const required = [
  "DATABASE_URL",
  "RELEASE_BASE_URL",
  "INTERNAL_MONITORING_TOKEN",
  "BUILD_SHA",
  "RELEASE_VERSION",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length)
  throw new Error(`Production release gate is missing required variables: ${missing.join(", ")}.`);
if (process.env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production.");
if (process.env.ALLOW_DEMO_PRINCIPAL?.trim().toLowerCase() === "true") {
  throw new Error("ALLOW_DEMO_PRINCIPAL must be false for a production release.");
}
if ((process.env.INTERNAL_MONITORING_TOKEN?.trim().length || 0) < 32) {
  throw new Error("INTERNAL_MONITORING_TOKEN must contain at least 32 characters.");
}

run("authoritative-e2e", "npm", ["run", "validate:e2e"]);
run("production-build", "npm", ["run", "build"]);

const baseUrl = new URL(process.env.RELEASE_BASE_URL).origin;
const headers = {
  accept: "application/json",
  "x-monitoring-token": process.env.INTERNAL_MONITORING_TOKEN,
};
const outputs = {};
for (const [name, endpoint] of [
  ["preflight", "/api/release/preflight"],
  ["status", "/api/release/status"],
  ["manifest", "/api/release/manifest"],
]) {
  const response = await fetch(new URL(endpoint, baseUrl), {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(
      `${name} gate returned HTTP ${response.status}: ${payload?.error?.message || "unknown failure"}.`,
    );
  }
  outputs[name] = payload.data;
}
if (!outputs.preflight?.passed || !outputs.status?.ready) {
  throw new Error(
    "Release readiness gates are not complete; release candidate creation remains blocked.",
  );
}

console.log(
  JSON.stringify(
    {
      passed: true,
      checkedAt: new Date().toISOString(),
      releaseVersion: process.env.RELEASE_VERSION,
      buildSha: process.env.BUILD_SHA,
      manifestHash: outputs.manifest?.manifestHash,
      gates: outputs.status?.gates,
    },
    null,
    2,
  ),
);

function run(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${name} failed with exit code ${result.status}.`);
}
