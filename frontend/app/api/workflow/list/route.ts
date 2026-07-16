import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { buildWorkflowSummary } from "@/lib/literature/mockWorkflows";
import type {
  SeriousnessCategory,
  WorkflowItem,
  WorkflowPriority,
  WorkflowStage,
  WorkflowStatus,
} from "@/lib/literature/types";

export const runtime = "nodejs";

const TENANT_ID = "demo-tenant";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(filePath: string): Promise<JsonObject> {
  try {
    const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return isJsonObject(value) ? value : {};
  } catch {
    return {};
  }
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstRecord(value: unknown): JsonObject {
  return Array.isArray(value) && isJsonObject(value[0]) ? value[0] : {};
}

function stageFor(status: string): WorkflowStage {
  if (status.startsWith("HITS_")) return "HITS";
  if (status.startsWith("SCREENING_")) return "SCREENING";
  if (status === "INTAKE_INPUT_CREATED") return "INTAKE";
  return "HITS";
}

function statusFor(status: string): WorkflowStatus {
  if (status.endsWith("_RUNNING")) return "IN_PROGRESS";
  if (status === "INTAKE_INPUT_CREATED") return "COMPLETED";
  return "NOT_STARTED";
}

function seriousnessFor(value: unknown): SeriousnessCategory[] {
  if (value === "Death") return ["Death"];
  if (value === "Life-threatening") return ["Life-threatening"];
  if (value === "Serious") return ["Other medically important condition"];
  return ["Non-serious"];
}

function priorityFor(seriousness: SeriousnessCategory[]): WorkflowPriority {
  if (seriousness.includes("Death") || seriousness.includes("Life-threatening")) {
    return "CRITICAL";
  }

  if (!seriousness.includes("Non-serious")) return "HIGH";
  return "MEDIUM";
}

async function buildWorkflowItem(
  evidenceRoot: string,
  packageId: string,
): Promise<WorkflowItem | null> {
  const packageRoot = path.join(evidenceRoot, packageId);
  const metadata = await readJson(path.join(packageRoot, "metadata.json"));

  if (Object.keys(metadata).length === 0) return null;

  const workflowState = await readJson(path.join(packageRoot, "workflow_state.json"));
  const hitsOutput = await readJson(path.join(packageRoot, "hits_output.json"));
  const screeningOutput = await readJson(
    path.join(packageRoot, "screening_output.json"),
  );
  const latestHit = firstRecord(hitsOutput.hits);
  const latestScreening = firstRecord(screeningOutput.screening);
  const status = asText(workflowState.status, "NEW");
  const history = Array.isArray(workflowState.history)
    ? workflowState.history
    : [];
  const firstEvent = isJsonObject(history[0]) ? history[0] : {};
  const seriousness = seriousnessFor(latestScreening.seriousness);
  const updatedAt = asText(
    workflowState.updated_at,
    asText(metadata.retrieved_at_utc, new Date(0).toISOString()),
  );

  return {
    id: packageId,
    articleTitle: asText(metadata.title, packageId),
    source: asText(metadata.source, "Evidence package"),
    product: asText(
      latestHit.product_name,
      asText(latestScreening.company_suspect_drugs, "Not identified"),
    ),
    country: asText(
      latestHit.country_of_interest,
      asText(metadata.country, "Not identified"),
    ),
    stage: stageFor(status),
    status: statusFor(status),
    priority: priorityFor(seriousness),
    seriousness,
    assignedTo: "Unassigned",
    dueDate: updatedAt,
    createdAt: asText(firstEvent.timestamp, updatedAt),
    updatedAt,
    hasOverride: false,
    isExpedited: seriousness.some((item) => item !== "Non-serious"),
  };
}

export async function GET() {
  const projectRoot = path.resolve(process.cwd(), "..");
  const evidenceRoot = path.join(projectRoot, "evidence_store", TENANT_ID);
  let packageIds: string[] = [];

  try {
    const entries = await readdir(evidenceRoot, { withFileTypes: true });
    packageIds = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    packageIds = [];
  }

  const items = (
    await Promise.all(
      packageIds.map((packageId) => buildWorkflowItem(evidenceRoot, packageId)),
    )
  ).filter((item): item is WorkflowItem => item !== null);
  const summary = buildWorkflowSummary(items);

  return NextResponse.json({
    ok: true,
    module: "literature-screening",
    generatedAt: new Date().toISOString(),
    summary,
    items,
  });
}
