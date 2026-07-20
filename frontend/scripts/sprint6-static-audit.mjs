import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const scanRoots = [path.join(projectRoot, "app"), path.join(projectRoot, "lib")];
const findings = [];

for (const scanRoot of scanRoots) {
  if (await exists(scanRoot)) await walk(scanRoot);
}

for (const envName of [".env", ".env.local", ".env.production", ".env.development"]) {
  const envPath = path.join(projectRoot, envName);
  if (await exists(envPath)) {
    const content = await readFile(envPath, "utf8");
    if (/^\s*(?:GROQ_API_KEY|OPENAI_API_KEY|AZURE_OPENAI_API_KEY|INTERNAL_MONITORING_TOKEN)\s*=\s*[^\s#][^\r\n]*$/m.test(content)) {
      findings.push({ severity: "warning", file: envName, message: "A local environment file contains configured secrets. Confirm it is ignored by Git." });
    }
  }
}

const critical = findings.filter((item) => item.severity === "critical");
console.log(JSON.stringify({ passed: critical.length === 0, checkedAt: new Date().toISOString(), findings }, null, 2));
process.exitCode = critical.length ? 1 : 0;

async function walk(directory) {
  for (const name of await readdir(directory)) {
    const absolute = path.join(directory, name);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      if (!["node_modules", ".next", "dist", "coverage"].includes(name)) await walk(absolute);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(name)) continue;
    const content = await readFile(absolute, "utf8");
    const relative = path.relative(projectRoot, absolute);

    if (/from\s+["'][^"']*next\.config["']|require\([^)]*next\.config/.test(content)) {
      findings.push({ severity: "critical", file: relative, message: "Runtime application code imports next.config, which can cause whole-project NFT tracing." });
    }
    if (/path\.(?:join|resolve)\(\s*process\.cwd\(\)\s*,\s*[^\s"'`]/.test(content)) {
      findings.push({ severity: "warning", file: relative, message: "Dynamic filesystem scope begins directly under process.cwd(). Scope it to a static subfolder." });
    }
  }
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
