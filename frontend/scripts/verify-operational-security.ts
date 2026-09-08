import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";

async function main() {
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function qualificationLoad(requestName, parent, isMain) {
    if (requestName === "server-only") return {};
    return originalLoad.call(this, requestName, parent, isMain);
  };

  Object.assign(process.env, {
    NODE_ENV: "production",
    INTERNAL_MONITORING_TOKEN: "qualification-monitoring-token-at-least-32-characters",
    SESSION_SECRET: "qualification-session-secret-at-least-32-characters",
    RELEASE_VERSION: "1.0.0",
    BUILD_SHA: "qualification-build",
    RELEASE_BASE_URL: "http://insecure.example.test",
    ALLOW_DEMO_PRINCIPAL: "false",
    MAX_REQUEST_BODY_BYTES: "16384",
    EDGE_RATE_LIMIT_PROVIDER: "",
    SECURITY_EVENT_SINK: "",
    DATABASE_BACKUP_VERIFIED_AT: "",
    DATABASE_RESTORE_VERIFIED_AT: "",
    ROLLBACK_BUILD_SHA: "",
  });

  const { resetRuntimeConfigForTests } = await import("../lib/enterprise/environment");
  resetRuntimeConfigForTests();
  const { identityHeadersAllowed } = await import("../lib/rbac/request-principal");
  assert.equal(identityHeadersAllowed("production"), false);
  assert.equal(identityHeadersAllowed("development"), true);

  const { proxy } = await import("../proxy");
  const blocked = proxy(new NextRequest("https://app.example.test/api/qualification", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "20000" },
    body: "{}",
  }));
  assert.equal(blocked.status, 413);
  assert.equal(blocked.headers.get("x-content-type-options"), "nosniff");
  assert.equal(blocked.headers.get("x-frame-options"), "DENY");
  assert.equal(blocked.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains");
  assert.match(blocked.headers.get("content-security-policy") || "", /object-src 'none'/);
  assert.match(blocked.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);

  const { validateReleaseEnvironment } = await import("../lib/release/environment-contract");
  const environment = validateReleaseEnvironment();
  for (const key of ["session-secret-strength", "distributed-rate-limit",
    "durable-security-event-sink", "recent-database-backup", "recent-restore-test",
    "rollback-build-available", "release-base-url"]) {
    const item = environment.items.find((candidate) => candidate.name === key);
    assert.ok(item, `${key} must be part of the release contract`);
    assert.equal(item.critical, true);
  }
  assert.equal(environment.items.find(
    (item) => item.name === "distributed-rate-limit")?.passed, false);
  assert.equal(environment.items.find(
    (item) => item.name === "recent-restore-test")?.passed, false);
  assert.equal(environment.items.find((item) => item.name === "release-base-url")?.passed, false);

  const { GET: detailedReadiness } = await import("../app/api/system/readiness/route");
  const deniedReadiness = await detailedReadiness(new NextRequest(
    "https://app.example.test/api/system/readiness"));
  assert.equal(deniedReadiness.status, 401);

  console.log(
    "Operational/security qualification passed: production identity is bearer-only; oversized requests and detailed readiness are blocked; security headers include HSTS; and distributed limiting, durable security events, recent backup/restore evidence, rollback build identity, and HTTPS probes are mandatory release gates.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
