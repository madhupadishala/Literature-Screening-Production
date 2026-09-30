import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const governedVendorPatterns = [
  "@qdrant/js-client-rest",
  "openai",
  "ioredis",
  "redis",
  "kafkajs",
  "@elastic/*",
  "@langchain/*",
  "langchain",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "lib/nexus/**/*.{ts,tsx}",
      "lib/auth/**/*.{ts,tsx}",
      "lib/rbac/**/*.{ts,tsx}",
      "lib/audit/**/*.{ts,tsx}",
      "lib/evidence/**/*.{ts,tsx}",
      "lib/platform/**/*.{ts,tsx}",
      "app/api/nexus/**/*.{ts,tsx}",
      "app/api/auth/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: governedVendorPatterns,
              message:
                "Shared Nexus platform/auth/RBAC code must use governed platform interfaces/adapters instead of importing vendor AI/data SDKs directly.",
            },
          ],
        },
      ],
    },
  },
  // Legacy module reconciliation happens in Sprints 4-7. Keep visibility now
  // without claiming those module boundaries have already been migrated.
  {
    files: [
      "lib/literature/**/*.{ts,tsx}",
      "lib/safety/**/*.{ts,tsx}",
      "app/api/literature/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: governedVendorPatterns,
              message:
                "Legacy regulated module vendor SDK access must migrate behind Nexus platform interfaces during module reconciliation.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "benchmark-output/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
