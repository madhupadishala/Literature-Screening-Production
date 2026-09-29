module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      from: {},
      to: { circular: true }
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
