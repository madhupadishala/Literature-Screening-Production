import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

function runPython(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "python",
      ["-c", command],
      {
        cwd,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const tenantId = body.tenant_id || "demo-tenant";
    const packageId = body.package_id;

    if (!packageId) {
      return NextResponse.json(
        {
          success: false,
          error: "package_id is required",
        },
        { status: 400 }
      );
    }

    const frontendRoot = process.cwd();
    const projectRoot = path.resolve(frontendRoot, "..");

    const packagePath = `evidence_store/${tenantId}/${packageId}`;
    const productMasterPath = "backend/knowledge/product_master/products.json";

    const pythonCommand = `
from backend.workflow import LiteratureWorkflow
import json

wf = LiteratureWorkflow("${productMasterPath}")
result = wf.run_package("${tenantId}", "${packagePath}")

print(json.dumps({
    "success": True,
    "tenant_id": "${tenantId}",
    "package_id": "${packageId}",
    "hits_count": result["hits_output"]["hits_count"],
    "screening_count": result["screening_output"]["screening_count"],
    "intake_input_count": result["intake_input"]["intake_input_count"]
}))
`;

    const output = await runPython(pythonCommand, projectRoot);
    const parsed = JSON.parse(output.trim());

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown workflow error",
      },
      { status: 500 }
    );
  }
}