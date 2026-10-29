import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";

/**
 * Conservative color codemod. Only literal hex colors near a named semantic
 * reference are changed. Unknown colors remain untouched and are inventoried.
 */
const frontend = resolve(process.cwd());
const root = resolve(frontend, "..");
const unmappedPath = join(root, "docs", "ui", "unmapped-colors.json");
const threshold = 12;
const anchors = [
  ["#0f62fe", "--nx-primary"],
  ["#185abd", "--nx-primary"],
  ["#1d4ed8", "--nx-primary"],
  ["#2563eb", "--nx-primary"],
  ["#0353e9", "--nx-primary-hover"],
  ["#002d9c", "--nx-primary-active"],
  ["#f4f4f4", "--nx-bg"],
  ["#ffffff", "--nx-surface"],
  ["#f8f8f8", "--nx-surface"],
  ["#f8fafc", "--nx-surface"],
  ["#f1f5f9", "--nx-surface"],
  ["#e0e0e0", "--nx-border"],
  ["#d6d6d6", "--nx-border"],
  ["#cbd5e1", "--nx-border"],
  ["#e2e8f0", "--nx-border"],
  ["#161616", "--nx-text"],
  ["#0f172a", "--nx-text"],
  ["#1e293b", "--nx-text"],
  ["#525252", "--nx-text-muted"],
  ["#64748b", "--nx-text-muted"],
  ["#6f6f6f", "--nx-text-muted"],
  ["#198038", "--nx-success"],
  ["#defbe6", "--nx-success-subtle"],
  ["#8e6a00", "--nx-warning"],
  ["#fff1c7", "--nx-warning-subtle"],
  ["#da1e28", "--nx-danger"],
  ["#fff1f1", "--nx-danger-subtle"],
];

function rgb(value) {
  const hex = value.slice(1);
  const full = hex.length === 3
    ? [...hex].map(character => character + character).join("")
    : hex;
  return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255);
}

function lab(value) {
  const linear = rgb(value).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const x = (linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375) / 0.95047;
  const y = linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.072175;
  const z = (linear[0] * 0.0193339 + linear[1] * 0.119192 + linear[2] * 0.9503041) / 1.08883;
  const transform = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const [fx, fy, fz] = [x, y, z].map(transform);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const references = anchors.map(([hex, token]) => ({hex, token, vector: lab(hex)}));
function matchColor(hex) {
  const current = lab(hex);
  let best = {distance: Infinity, token: null};
  for (const candidate of references) {
    const distance = Math.hypot(...current.map((value, index) => value - candidate.vector[index]));
    if (distance < best.distance) best = {distance, token: candidate.token};
  }
  return best.distance <= threshold ? best.token : null;
}

const exclusions = new Set(["node_modules", ".next", ".git", "out", "build"]);
const excludePaths = ["app/api", "auth", "lib/auth", "src/design-system"];
const excludedPath = path => excludePaths.some(prefix => path === prefix || path.startsWith(prefix + "/"));
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (exclusions.has(entry.name)) continue;
    if (excludedPath(relative(frontend, join(dir, entry.name)).replaceAll("\\", "/"))) continue;
    const pathname = join(dir, entry.name);
    if (entry.isDirectory()) walk(pathname);
    else if (/\.(tsx|ts|css)$/.test(entry.name) &&
             relative(frontend, pathname).replaceAll("\\", "/") !== "app/design-tokens.css") {
      files.push(pathname);
    }
  }
}
walk(frontend);
const unmapped = [];
let replacements = 0;
const tokenRegex = /#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?\b/g;
for (const file of files) {
  const relativeName = relative(root, file).replaceAll("\\", "/");
  const original = readFileSync(file, "utf8");
  const lines = original.split(/\r?\n/);
  const next = lines.map((line, index) => {
    // Never replace hashes inside urls, SVG path data, or CSS selectors:
    // these are ambiguous without a syntax-aware parser.
    if (/url\(|href=|xlink:href=|<svg|<path|<linearGradient|<stop|<rect/.test(line)) {
      for (const match of line.matchAll(tokenRegex)) {
        unmapped.push({file: relativeName, line: index + 1, value: match[0], reason: "unsafe context"});
      }
      return line;
    }
    return line.replace(tokenRegex, (hex, offset) => {
      const before = line.slice(Math.max(0, offset - 24), offset);
      if (/rgba?\(\s*$/i.test(before)) {
        unmapped.push({file: relativeName, line: index + 1, value: hex, reason: "hex in rgb() context"});
        return hex;
      }
      const token = matchColor(hex.toLowerCase());
      if (!token) {
        unmapped.push({file: relativeName, line: index + 1, value: hex, reason: "CIE76 > 12"});
        return hex;
      }
      replacements++;
      return `var(${token})`;
    });
  }).join("\n");
  if (original !== next) writeFileSync(file, next);
}
mkdirSync(dirname(unmappedPath), {recursive: true});
writeFileSync(unmappedPath, JSON.stringify({
  thresholdCie76: threshold,
  replacements,
  unmappedCount: unmapped.length,
  colors: unmapped,
}, null, 2) + "\n");
console.log(JSON.stringify({replacements, unmapped: unmapped.length, scannedFiles: files.length}));
