import type { PackageState } from "./package-workflow-store";

export type PackageAction =
  | "ASSIGN"
  | "UNLOCK"
  | "LOCK"
  | "OVERRIDE"
  | "ROUTE_BACK"
  | "FORCE_RERUN";

const TENANT_ID = "demo-tenant";

export async function searchWorkflowPackages(query: string) {
  const params = new URLSearchParams({
    query,
    tenant_id: TENANT_ID,
  });

  const response = await fetch(`/api/packages/search?${params.toString()}`, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to search packages.");
  }

  return data;
}

export async function performWorkflowPackageAction(input: {
  packageId: string;
  action: PackageAction;
  assignedTo?: string;
  routeTo?: PackageState;
  comment?: string;
}) {
  const response = await fetch("/api/packages/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      tenantId: TENANT_ID,
      performedBy: "Madhu",
      role: "Super User",
      environment: "PROD",
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Package action failed.");
  }

  return data;
}

export async function getWorkflowPackageHistory(packageId: string) {
  const params = new URLSearchParams({
    package_id: packageId,
    tenant_id: TENANT_ID,
  });

  const response = await fetch(`/api/packages/history?${params.toString()}`, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to load package history.");
  }

  return data;
}

export async function getWorkflowPackageAudit(packageId: string) {
  const params = new URLSearchParams({
    package_id: packageId,
  });

  const response = await fetch(`/api/packages/audit?${params.toString()}`, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to load package audit.");
  }

  return data;
}