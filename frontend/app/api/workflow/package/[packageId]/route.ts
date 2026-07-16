import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const TENANT_ID = "demo-tenant";
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const FILES = {
  metadata: "metadata.json",
  workflow_state: "workflow_state.json",
  hits_output: "hits_output.json",
  screening_output: "screening_output.json",
  intake_input: "intake_input.json",
};

function readJsonFile(filePath: string): JsonValue {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ packageId: string }> }
) {
  const { packageId } = await context.params;
  const decodedPackageId = decodeURIComponent(packageId || "");

  if (!PACKAGE_ID_PATTERN.test(decodedPackageId)) {
    return NextResponse.json(
      {
        success: false,
        error: "packageId must contain only letters, numbers, underscores, and hyphens.",
      },
      { status: 400 }
    );
  }

  const projectRoot = path.resolve(process.cwd(), "..");

  const packageFolder = path.join(
    projectRoot,
    "evidence_store",
    TENANT_ID,
    decodedPackageId
  );

  if (!fs.existsSync(packageFolder)) {
    return NextResponse.json(
      {
        success: false,
        error: `Evidence package not found: ${decodedPackageId}`,
        expected_path: packageFolder,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    tenant_id: TENANT_ID,
    package_id: decodedPackageId,
    metadata: readJsonFile(path.join(packageFolder, FILES.metadata)),
    workflow_state: readJsonFile(path.join(packageFolder, FILES.workflow_state)),
    hits_output: readJsonFile(path.join(packageFolder, FILES.hits_output)),
    screening_output: readJsonFile(path.join(packageFolder, FILES.screening_output)),
    intake_input: readJsonFile(path.join(packageFolder, FILES.intake_input)),
  });
}
