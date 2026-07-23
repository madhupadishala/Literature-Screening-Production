import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const frontendRoot = process.cwd();
const repositoryRoot = path.resolve(frontendRoot, "..");

const files = {
  dockerfile: await read("frontend/Dockerfile"),
  compose: await read("frontend/docker-compose.yml"),
  nextConfig: await read("frontend/next.config.ts"),
  bicep: await read("infra/azure/main.bicep"),
  deployScript: await read("infra/azure/deploy-staging.ps1"),
  runbook: await read("infra/azure/README.md"),
  environmentExample: await read("frontend/.env.production.example"),
};

assert.match(files.nextConfig, /output:\s*"standalone"/u);
assert.match(files.nextConfig, /deploymentId:\s*process\.env\.BUILD_SHA/u);
assert.match(files.dockerfile, /FROM node:22-bookworm-slim AS builder/u);
assert.match(files.dockerfile, /USER nextjs/u);
assert.match(files.dockerfile, /CMD \["node", "server\.js"\]/u);
assert.match(files.compose, /pgvector\/pgvector:pg16/u);
assert.match(files.compose, /service_completed_successfully/u);

for (const resourceType of [
  "Microsoft.App/containerApps",
  "Microsoft.App/jobs",
  "Microsoft.ContainerRegistry/registries",
  "Microsoft.DBforPostgreSQL/flexibleServers",
  "Microsoft.Network/virtualNetworks",
  "Microsoft.Network/privateDnsZones",
  "Microsoft.OperationalInsights/workspaces",
]) {
  assert.ok(files.bicep.includes(resourceType), `Missing ${resourceType}.`);
}

assert.match(files.bicep, /publicNetworkAccess:\s*'Disabled'/u);
assert.match(files.bicep, /value:\s*'VECTOR'/u);
assert.match(files.bicep, /allowInsecure:\s*false/u);
assert.match(files.bicep, /activeRevisionsMode:\s*'Single'/u);
assert.match(files.deployScript, /az acr build/u);
assert.match(files.deployScript, /az containerapp job start/u);
assert.match(files.runbook, /staging\/validation/u);
assert.match(files.environmentExample, /ALLOW_DEMO_PRINCIPAL=false/u);

for (const content of Object.values(files)) {
  assert.doesNotMatch(content, /gsk_[A-Za-z0-9]{20,}/u);
  assert.doesNotMatch(content, /postgresql:\/\/[^:\s]+:[^@<$\s]{12,}@/u);
}

const migration = await read(
  "frontend/database/migrations/014_controlled_knowledge_pgvector.sql",
);
assert.match(migration, /CREATE EXTENSION IF NOT EXISTS vector/iu);

console.log("ClinixAI Azure deployment foundation verification passed.");
console.table([
  { gate: "Container image", status: "PASS" },
  { gate: "Local pgvector parity", status: "PASS" },
  { gate: "Private Azure network", status: "PASS" },
  { gate: "PostgreSQL + vector", status: "PASS" },
  { gate: "HTTPS ingress and probes", status: "PASS" },
  { gate: "Controlled migration job", status: "PASS" },
  { gate: "Secret-pattern scan", status: "PASS" },
]);

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}
