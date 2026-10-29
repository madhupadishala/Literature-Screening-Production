import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
const root = process.cwd();
const findings = [];
function walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (["node_modules", ".next", ".git", "out", "build"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".tsx")) {
      const text = readFileSync(path, "utf8");
      if (!/<style\s+jsx\b/.test(text)) continue;
      const snippets = [...text.matchAll(/<style\s+jsx[^>]*>\s*\{?\s*`([\s\S]{0,150})/g)]
        .map(match => match[1].replaceAll(/\s+/g, " ").slice(0, 95));
      findings.push({file: relative(root, path).replaceAll("\\", "/"), snippets, bytes: text.length});
    }
  }
}
walk(root);
console.log(JSON.stringify({count:findings.length, files:findings}, null, 2));
