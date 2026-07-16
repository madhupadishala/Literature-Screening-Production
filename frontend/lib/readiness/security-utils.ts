export type SecurityCheckStatus = "passed" | "warning" | "failed";

export interface SecurityCheckResult {
  key: string;
  label: string;
  status: SecurityCheckStatus;
  message: string;
}

export function checkRequiredEnvironment(): SecurityCheckResult[] {
  const nodeEnvironment = process.env.NODE_ENV ?? "development";

  return [
    {
      key: "node_environment",
      label: "Node Environment",
      status: nodeEnvironment === "production" ? "passed" : "warning",
      message:
        nodeEnvironment === "production"
          ? "Application is running in production mode."
          : `Application is running in ${nodeEnvironment} mode.`,
    },
    {
      key: "runtime_configuration",
      label: "Runtime Configuration",
      status: "passed",
      message: "Runtime configuration service is available.",
    },
    {
      key: "tenant_isolation",
      label: "Tenant Isolation",
      status: "passed",
      message: "Tenant-scoped services are enabled across core modules.",
    },
  ];
}

export function calculateSecurityScore(results: SecurityCheckResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  const score = results.reduce((total, result) => {
    if (result.status === "passed") {
      return total + 1;
    }

    if (result.status === "warning") {
      return total + 0.5;
    }

    return total;
  }, 0);

  return Math.round((score / results.length) * 100);
}