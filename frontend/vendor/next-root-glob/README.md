# Next root-directory glob adapter

This replaces only `@next/eslint-plugin-next`'s fast-glob dependency, removing its vulnerable braces dependency while preserving the Next lint rules. The inspected plugin 16.4.0 uses only `globSync(pattern, { onlyDirectories: true })` in `get-root-dirs`. This adapter uses Node's filesystem glob and returns directories only. It does not claim to implement the full fast-glob API.

Brace expansion and oversized patterns are rejected before glob evaluation. For multiple root directories use the Next ESLint `settings.next.rootDir` array instead of brace patterns. Other glob features use Node semantics; symlink/dot-directory edge cases may differ from fast-glob. Node >=22.17 is required. Reassess this override whenever the Next lint plugin is upgraded.
