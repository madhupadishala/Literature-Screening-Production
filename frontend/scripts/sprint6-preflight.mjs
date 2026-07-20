const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.RELEASE_BASE_URL || "http://localhost:3000");
const token = process.env.INTERNAL_MONITORING_TOKEN;
const response = await fetch(new URL("/api/release/preflight", baseUrl), {
  headers: {
    accept: "application/json",
    ...(token ? { "x-monitoring-token": token } : {}),
  },
});
const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
process.exitCode = response.ok && payload?.ok && payload?.data?.passed ? 0 : 1;

function normalizeBaseUrl(value) {
  return new URL(value).origin;
}
