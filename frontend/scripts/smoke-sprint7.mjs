import process from "node:process";

const baseUrl = process.argv[2] || "http://localhost:3000";

const checks = [];

async function request(path, init) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  checks.push({
    path,
    method: init?.method || "GET",
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    success: response.ok && payload.success === true,
  });
  return { response, payload };
}

const workspace = await request("/api/literature/adhoc-search");
if (!workspace.response.ok || !workspace.payload.success) {
  throw new Error(
    workspace.payload.error || "Ad Hoc Search workspace API failed.",
  );
}

const sourceKeys = (workspace.payload.data.sources || [])
  .filter((source) => source.enabled)
  .map((source) => source.sourceKey);

if (sourceKeys.length === 0) {
  throw new Error("No enabled literature source is available.");
}

const preferredSource = sourceKeys.includes("PUBMED")
  ? "PUBMED"
  : sourceKeys[0];

const search = await request("/api/literature/adhoc-search", {
  method: "POST",
  body: JSON.stringify({
    criteria: {
      product: "paracetamol",
      sourceKeys: [preferredSource],
      limit: 3,
    },
  }),
});

if (!search.response.ok || !search.payload.success) {
  throw new Error(
    search.payload.error || "Live Ad Hoc Search smoke test failed.",
  );
}

const configuration = await request("/api/admin/configuration");
if (!configuration.response.ok || !configuration.payload.success) {
  throw new Error(
    configuration.payload.error || "Configuration API failed.",
  );
}

console.log("");
console.log("============================================================");
console.log("SPRINT 7 LIVE SMOKE TEST PASSED");
console.log("============================================================");
console.table(checks);
console.log(`Source tested: ${preferredSource}`);
console.log(`Results returned: ${search.payload.data.resultCount}`);
