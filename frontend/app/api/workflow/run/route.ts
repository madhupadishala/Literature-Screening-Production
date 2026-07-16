import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function runPython(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "python",
      args,
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
    const body = (await request.json()) as Record<string, unknown>;

    const tenantId =
      typeof body.tenant_id === "string" ? body.tenant_id : "demo-tenant";
    const packageId =
      typeof body.package_id === "string" ? body.package_id : "";

    if (!TENANT_ID_PATTERN.test(tenantId)) {
      return NextResponse.json(
        {
          success: false,
          error: "tenant_id must contain only lowercase letters, numbers, and hyphens.",
        },
        { status: 400 }
      );
    }

    if (!PACKAGE_ID_PATTERN.test(packageId)) {
      return NextResponse.json(
        {
          success: false,
          error: "package_id must contain only letters, numbers, underscores, and hyphens.",
        },
        { status: 400 }
      );
    }

    const frontendRoot = process.cwd();
    const projectRoot = path.resolve(frontendRoot, "..");

    const packagePath = path.join(
      projectRoot,
      "evidence_store",
      tenantId,
      packageId,
    );
    const productMasterPath = path.join(
      projectRoot,
      "backend",
      "knowledge",
      "product_master",
      "products.json",
    );

    try {
      await access(packagePath);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Evidence package not found.",
        },
        { status: 404 },
      );
    }

    const pythonCommand = `
from backend.workflow import LiteratureWorkflow
import json
import sys

product_master_path, tenant_id, package_path = sys.argv[1:]
wf = LiteratureWorkflow(product_master_path)
result = wf.run_package(tenant_id, package_path)

print(json.dumps({
    "success": True,
    "tenant_id": tenant_id,
    "package_id": package_path.rsplit("/", 1)[-1].rsplit("\\\\", 1)[-1],
    "hits_count": result["hits_output"]["hits_count"],
    "screening_count": result["screening_output"]["screening_count"],
    "intake_input_count": result["intake_input"]["intake_input_count"]
}))
`;

    const output = await runPython(
      ["-c", pythonCommand, productMasterPath, tenantId, packagePath],
      projectRoot,
    );
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
