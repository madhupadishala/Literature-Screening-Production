import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");
const read = (relative: string) =>
  readFileSync(path.resolve(root, relative), "utf8");
const readRepo = (relative: string) =>
  readFileSync(path.resolve(repoRoot, relative), "utf8");

const tokens = read("app/design-tokens.css");
for (const token of [
  "--nx-color-bg",
  "--nx-color-surface",
  "--nx-color-border",
  "--nx-color-text",
  "--nx-color-interactive",
  "--nx-color-focus",
  "--nx-color-positive",
  "--nx-color-warning",
  "--nx-color-critical",
  "--nx-control-h-default",
  "--nx-table-row-default",
]) {
  assert.ok(tokens.includes(token), `Missing governed design token: ${token}`);
}

const shell = read("components/enterprise/ApplicationShell.tsx");
for (const contract of [
  'id="main-content"',
  "<Navigation />",
  "<ModuleSubNavigation",
]) {
  assert.ok(shell.includes(contract), `ApplicationShell missing: ${contract}`);
}

const state = read("components/enterprise/OperationalState.tsx");
for (const kind of ["loading", "empty", "error", "read-only", "info"]) {
  assert.ok(state.includes(kind), `OperationalState missing kind: ${kind}`);
}
assert.ok(state.includes('role={kind === "error" ? "alert" : "status"}'));
assert.ok(state.includes('aria-live={kind === "error" ? "assertive" : "polite"}'));

const navigation = read("components/Navigation.tsx");
assert.ok(navigation.includes('className="skip-link"'));
assert.ok(navigation.includes("useRouter"));
assert.ok(!navigation.includes("window.location.assign("));

for (const page of [
  "app/page.tsx",
  "app/literature/dashboard/page.tsx",
  "app/intake/page.tsx",
  "app/cases/page.tsx",
  "app/submissions/page.tsx",
]) {
  const source = read(page);
  assert.ok(
    source.includes("ApplicationShell"),
    `${page} has not migrated to the governed application shell.`,
  );
  assert.ok(
    !source.includes('import Navigation from "@/components/Navigation"'),
    `${page} still mounts primary navigation directly.`,
  );
}

const vercel = JSON.parse(read("vercel.json")) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
};
assert.equal(
  vercel.git?.deploymentEnabled?.["cleanup/zero-deviation-baseline-20260930"],
  false,
  "Working cleanup branch must not auto-deploy to Vercel.",
);

const wave = readRepo("docs/cleanup/SPRINT_11_14_WAVE_TRACEABILITY.md");
for (const contract of [
  "Sprint 11 — Product Design System v1.0 + Application Shell",
  "Product Design Guardian",
  "IBM Carbon",
  "PatternFly",
  "preview/wave4",
  "source qualification first",
]) {
  assert.ok(wave.includes(contract), `Wave 4 traceability missing: ${contract}`);
}

console.log("Cleanup Sprint 11 Product Design System + Application Shell verification passed.");
console.log("Governed shell, operational states, design tokens and Vercel checkpoint policy are present.");
