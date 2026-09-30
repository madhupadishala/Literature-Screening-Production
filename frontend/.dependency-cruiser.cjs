module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are prohibited across the production dependency graph.",
      from: {},
      to: { circular: true }
    },
    {
      name: "nexus-platform-no-direct-vendor-ai-data-sdks",
      severity: "error",
      comment:
        "Nexus/auth/RBAC platform code must consume governed platform interfaces, not vendor AI/vector/cache/event/search SDKs directly.",
      from: {
        path: "^(lib/(nexus|auth|rbac|audit|evidence|platform)/|app/api/(nexus|auth)/)"
      },
      to: {
        path:
          "^node_modules/(@qdrant/js-client-rest|openai|ioredis|redis|kafkajs|@elastic/|@langchain/|langchain)"
      }
    },
    {
      name: "presentation-no-direct-database",
      severity: "error",
      comment: "React presentation components must not bypass application/server services to access database adapters.",
      from: { path: "^components/" },
      to: { path: "^lib/(database|db)/" }
    },
    {
      name: "platform-no-module-private-dependency",
      severity: "warn",
      comment:
        "Shared platform code should not depend on Literature/Safety private domain internals. Existing findings are cleanup debt until migrated to contracts.",
      from: { path: "^lib/(nexus|auth|rbac|audit|evidence|platform)/" },
      to: { path: "^lib/(literature|safety)/" }
    },
    {
      name: "regulated-module-no-direct-vendor-ai-data-sdks",
      severity: "warn",
      comment:
        "Legacy regulated module code must migrate vendor SDK usage behind Nexus platform interfaces during module reconciliation.",
      from: {
        path: "^(lib/(literature|safety)/|app/api/literature/)"
      },
      to: {
        path:
          "^node_modules/(@qdrant/js-client-rest|openai|ioredis|redis|kafkajs|@elastic/|@langchain/|langchain)"
      }
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: ["(^|/)scripts/", "\\.d\\.ts$"] },
      to: {}
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"]
    },
    exclude: "node_modules|\\.next|benchmark-output"
  }
};
