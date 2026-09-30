import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repoRoot = path.resolve(root, "..");

function read(relativePath: string): string {
  const absolute = path.resolve(root, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing required design-governed file: ${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireIncludes(source: string, values: string[], label: string) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${label} is missing required design contract value: ${value}`);
    }
  }
}

function requireRepoDoc(relativePath: string) {
  const absolute = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing controlled design document: ${relativePath}`);
  }
}

requireRepoDoc("docs/design/PRODUCT_DESIGN_SYSTEM.md");
requireRepoDoc("docs/design/PRODUCT_DESIGN_GUARDIAN.md");

const navigation = read("components/Navigation.tsx");
requireIncludes(
  navigation,
  [
    'label: "Dashboard"',
    'label: "Literature Screening"',
    'label: "Intake"',
    'label: "Case Processing"',
    'label: "Submissions"',
  ],
  "Primary module navigation",
);

for (const forbidden of [
  'label: "Search"',
  'label: "Workflow"',
  'label: "Hits"',
  'label: "Screening"',
  'label: "Review / MR"',
  'label: "Reports"',
  'label: "Administration"',
]) {
  if (navigation.includes(forbidden)) {
    throw new Error(
      `Primary module navigation contains a child workflow screen as a top-level module: ${forbidden}`,
    );
  }
}

const subNavigation = read("components/ModuleSubNavigation.tsx");
requireIncludes(
  subNavigation,
  [
    'label: "Dashboard"',
    'label: "Hits"',
    'label: "Screening"',
    'label: "Medical Review"',
    'label: "Administration"',
    'label: "Duplicate Check"',
    'label: "Triage"',
  ],
  "Module sub-navigation",
);

const caseWorkspace = read("app/cases/[caseId]/case-workspace-client.tsx");
requireIncludes(
  caseWorkspace,
  [
    '"General"',
    '"Patient"',
    '"Products"',
    '"Events"',
    '"Safety Assessment"',
    '"Narrative"',
    '"Action Items"',
    '"Additional Information"',
    '"Evidence & Export"',
    '"Audit & Versions"',
  ],
  "Case Processing tab architecture",
);

if (/["']Other["']/.test(caseWorkspace)) {
  throw new Error(
    'Case Processing uses an uncontrolled "Other" tab. Use a defined information architecture category instead.',
  );
}

const designSystem = fs.readFileSync(
  path.resolve(repoRoot, "docs/design/PRODUCT_DESIGN_SYSTEM.md"),
  "utf8",
);
requireIncludes(
  designSystem,
  [
    "Figma",
    "IBM Carbon Design System",
    "PatternFly",
    "Radix Primitives",
    "shadcn/ui",
    "Product Design Guardian",
  ],
  "Product design system",
);

console.log("Product Design Guardian static architecture checks passed.");
console.log("Primary modules: Dashboard, Literature Screening, Intake, Case Processing, Submissions.");
console.log("Controlled design documents and screen/tab taxonomy are present.");
console.log(
  "Reminder: visual hierarchy, accessibility and browser verification remain review/evidence activities in addition to this static gate.",
);
