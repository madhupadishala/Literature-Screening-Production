import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const baselinePath = process.argv[3];
const debt = {
  rawHexTsx: 0,
  rawHexCss: 0,
  styledJsxFiles: 0,
  inlineColorStyles: 0,
  filesOver300Lines: 0,
  blueOccurrences: 0,
};
const sources = [];
const blues = /#(?:0f62fe|185abd|1d4ed8|2563eb)\b/gi;
const rawHex = /#[\da-fA-F]{6}\b/g;
const styledJsx = /<style\s+jsx\b/;
const inlineColor = /style\s*=\s*\{\{[^}]*\b(?:color|background(?:Color)?)\s*:/g;

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(path);
    } else if (/\.(tsx|css)$/.test(entry.name)) {
      sources.push(path);
    }
  }
}

visit(root);
for (const file of sources) {
  const path = relative(root, file).replaceAll("\\", "/");
  const code = readFileSync(file, "utf8");
  const lines = code.split(/\r?\n/).length;
  const isTsx = path.endsWith(".tsx");
  const isTokens = path === "app/design-tokens.css";
  if (isTsx) debt.rawHexTsx += (code.match(rawHex) ?? []).length;
  if (path.endsWith(".css") && !isTokens) {
    debt.rawHexCss += (code.match(rawHex) ?? []).length;
  }
  if (isTsx && styledJsx.test(code)) debt.styledJsxFiles += 1;
  if (isTsx) debt.inlineColorStyles += (code.match(inlineColor) ?? []).length;
  if (lines > 300) debt.filesOver300Lines += 1;
  if (!isTokens) debt.blueOccurrences += (code.match(blues) ?? []).length;
}
console.log(JSON.stringify({ root, ...debt }, null, 2));
if (baselinePath) {
  const limits = JSON.parse(readFileSync(baselinePath, "utf8"));
  const regressions = Object.keys(debt).filter(key => debt[key] > limits[key]);
  if (regressions.length) {
    console.error("UI debt ratchet increased:", regressions.join(", "));
    process.exitCode = 1;
  }
}
