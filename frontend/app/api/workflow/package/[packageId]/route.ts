import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const JSON_FILES = {
  metadata: ["metadata.json", "evidence_metadata.json"],
  workflow_state: ["workflow_state.json"],
  hits_output: ["hits_output.json"],
  screening_output: ["screening_output.json"],
  intake_input: ["intake_input.json"],
};

function readJsonIfExists(folderPath: string, fileNames: string[]) {
  for (const fileName of fileNames) {
    const filePath = path.join(folderPath, fileName);

    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function findPackageFolder(baseDir: string, packageId: string): string | null {
  if (!fs.existsSync(baseDir)) return null;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fullPath = path.join(baseDir, entry.name);

    if (entry.name === packageId) {
      return fullPath;
    }

    const nested = findPackageFolder(fullPath, packageId);
    if (nested) return nested;
  }

  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ packageId: string }> }
) {
  try {
    const { packageId } = await context.params;
    const decodedPackageId = decodeURIComponent(packageId);

    if (!decodedPackageId) {
      return NextResponse.json(
        { success: false, error: "Missing packageId." },
        { status: 400 }
      );
    }

    const root = process.cwd();

    const candidateRoots = [
      path.join(root, "evidence_packages"),
      path.join(root, "data", "evidence_packages"),
      path.join(root, "public", "evidence_packages"),
      path.join(root, "..", "evidence_packages"),
      path.join(root, "..", "data", "evidence_packages"),
    ];

    let packageFolder: string | null = null;

    for (const candidateRoot of candidateRoots) {
      packageFolder = findPackageFolder(candidateRoot, decodedPackageId);
      if (packageFolder) break;
    }

    if (!packageFolder) {
      return NextResponse.json(
        {
          success: false,
          error: `Evidence package not found: ${decodedPackageId}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      package_id: decodedPackageId,
      metadata: readJsonIfExists(packageFolder, JSON_FILES.metadata),
      workflow_state: readJsonIfExists(packageFolder, JSON_FILES.workflow_state),
      hits_output: readJsonIfExists(packageFolder, JSON_FILES.hits_output),
      screening_output: readJsonIfExists(packageFolder, JSON_FILES.screening_output),
      intake_input: readJsonIfExists(packageFolder, JSON_FILES.intake_input),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load workflow package." },
      { status: 500 }
    );
  }
}