/* eslint-disable @typescript-eslint/no-require-imports -- Upstream Next plugin requires a CommonJS dependency. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// This is intentionally limited to the API used by get-root-dirs in Next ESLint.
function globSync(pattern, options = {}) {
  if (typeof pattern !== "string" || pattern.length > 4096) throw new RangeError("Root glob is too large");
  if (options.onlyDirectories !== true || Object.keys(options).some(k => !["onlyDirectories", "cwd"].includes(k))) throw new TypeError("Unsupported Next root glob options");
  // Bound nesting and expansion work before any glob parser sees the pattern.
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") { i++; continue; }
    // Root configuration does not need brace expansion; keep the boundary narrow.
    if (pattern[i] === "{" || pattern[i] === "}") throw new RangeError("Brace expansion is not supported for Next root directories");
  }
  const cwd = options.cwd || process.cwd();
  return fs.globSync(pattern, { cwd }).filter(entry => {
    try { return fs.statSync(path.resolve(cwd, entry)).isDirectory(); }
    catch { return false; }
  });
}
module.exports = { globSync };
