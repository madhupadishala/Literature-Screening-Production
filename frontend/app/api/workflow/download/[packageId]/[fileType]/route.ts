import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const TENANT_ID = "demo-tenant";
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const ALLOWED_FILES: Record<string, string> = {
  metadata: "metadata.json",
  workflow_state: "workflow_state.json",
  hits_output: "hits_output.json",
  screening_output: "screening_output.json",
  intake_input: "intake_input.json",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ packageId: string; fileType: string }> }
) {
  try {
    const { packageId, fileType } = await context.params;

    const decodedPackageId = decodeURIComponent(packageId || "");
    const decodedFileType = decodeURIComponent(fileType || "");

    if (!PACKAGE_ID_PATTERN.test(decodedPackageId) || !decodedFileType) {
      return NextResponse.json(
        {
          success: false,
          error: "packageId must contain only letters, numbers, underscores, and hyphens.",
        },
        { status: 400 }
      );
    }

    const fileName = ALLOWED_FILES[decodedFileType];

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: `Invalid fileType: ${decodedFileType}` },
        { status: 400 }
      );
    }

    const projectRoot = path.resolve(process.cwd(), "..");

    const filePath = path.join(
      projectRoot,
      "evidence_store",
      TENANT_ID,
      decodedPackageId,
      fileName
    );

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          success: false,
          error: `File not found: ${fileName}`,
        },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${decodedPackageId}_${fileName}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to download workflow file." },
      { status: 500 }
    );
  }
}
