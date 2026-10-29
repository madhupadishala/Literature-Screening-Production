import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

if (process.env.CI !== "true") {
  throw new Error("UI audit requires CI=true");
}

const un = JSON.parse(readFileSync("docs/ui/unmapped-colors.json", "utf8"));
const tokens = readFileSync("frontend/app/design-tokens.css", "utf8");

const refs = {
  "--nx-primary": "#0f62fe",
  "--nx-primary-hover": "#0353e9",
  "--nx-primary-active": "#002d9c",
  "--nx-bg": "#f4f4f4",
  "--nx-surface": "#ffffff",
  "--nx-border": "#d6d6d6",
  "--nx-text": "#161616",
  "--nx-text-muted": "#6f6f6f",
  "--nx-success": "#198038",
  "--nx-success-subtle": "#defbe6",
  "--nx-warning": "#8e6a00",
  "--nx-warning-subtle": "#fff1c7",
  "--nx-danger": "#da1e28",
  "--nx-danger-subtle": "#fff1f1",
};
function channels(hex) {
  let s = hex.slice(1);
  if (s.length === 3) s = [...s].map(x => x + x).join("");
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
}
function linear(rgb) {
  return rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
}
function lab(hex) {
  const [r, g, b] = linear(channels(hex));
  const xyz = [
    (r * .4124564 + g * .3575761 + b * .1804375) / .95047,
    (r * .2126729 + g * .7151522 + b * .072175),
    (r * .0193339 + g * .119192 + b * .9503041) / 1.08883,
  ].map(v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}
function distance(a, b) {
  const x = lab(a);
  const y = lab(b);
  return Math.hypot(...x.map((v, i) => v - y[i]));
}
function contrast(a, b) {
  const luminance = hex => {
    const [r, g, b] = linear(channels(hex));
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const grouped = new Map();
for (const item of un.colors) {
  const key = item.value.toLowerCase();
  const row = grouped.get(key) ?? { value: key, count: 0, files: new Set() };
  row.count++;
  row.files.add(item.file);
  grouped.set(key, row);
}
const top = [...grouped.values()].sort((a, b) => b.count - a.count)
  .slice(0, 20).map(row => {
    const nearest = Object.entries(refs).map(([token, hex]) => ({
      token, distance: distance(row.value, hex),
    })).sort((a, b) => a.distance - b.distance)[0];
    return {
      value: row.value, count: row.count,
      files: [...row.files], nearestToken: nearest.token,
      distanceCie76: Number(nearest.distance.toFixed(2)),
      proposedMapping: nearest.distance <= 12 ? nearest.token : "REVIEW_REQUIRED",
    };
  });
function parseTheme(source) {
  const entries = {};
  for (const match of source.matchAll(/(--nx-[\w-]+):\s*(#[\da-fA-F]{6})\s*;/g)) {
    entries[match[1]] = match[2];
  }
  return entries;
}
const light = parseTheme(tokens.split('[data-density=')[0]);
const dark = parseTheme(tokens.slice(tokens.indexOf('[data-theme="dark"]')));
const pairs = [
  ["--nx-color-text", "--nx-color-bg"],
  ["--nx-color-text", "--nx-color-surface"],
  ["--nx-color-text-secondary", "--nx-color-surface"],
  ["--nx-color-text-muted", "--nx-color-surface"],
  ["--nx-color-text-inverse", "--nx-primary"],
  ["--nx-color-positive", "--nx-color-positive-bg"],
  ["--nx-color-warning", "--nx-color-warning-bg"],
  ["--nx-color-critical", "--nx-color-critical-bg"],
  ["--nx-color-info", "--nx-color-info-bg"],
];
const report = {};
for (const [themeName, theme] of Object.entries({light, dark})) {
  report[themeName] = pairs.map(([foreground, background]) => {
    const a = theme[foreground];
    const b = theme[background];
    return {
      foreground, background, foregroundValue: a ?? "ALIAS_OR_MISSING",
      backgroundValue: b ?? "ALIAS_OR_MISSING",
      contrastRatio: a && b ? Number(contrast(a, b).toFixed(2)) : null,
      result: !a || !b ? "NOT_VERIFIED" : contrast(a, b) >= 4.5 ? "PASS" : "FAIL",
    };
  });
}
const output = {unmappedTotal: un.unmappedCount, top20: top, contrast: report};
const path = "test-results/nexus-ui-audit.json";
mkdirSync(dirname(path), {recursive: true});
writeFileSync(path, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
