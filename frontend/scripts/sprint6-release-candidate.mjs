const baseUrl = new URL(process.argv[2] || process.env.RELEASE_BASE_URL || "http://localhost:3000").origin;
const token = process.env.INTERNAL_MONITORING_TOKEN;
const createdBy = process.env.RELEASE_OPERATOR || "command-line-release-operator";
const response = await fetch(new URL("/api/release/candidate", baseUrl), {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
    ...(token ? { "x-monitoring-token": token } : {}),
  },
  body: JSON.stringify({ createdBy }),
});
const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
process.exitCode = response.ok && payload?.ok ? 0 : 1;
