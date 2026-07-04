import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function readJson(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export async function GET() {
  try {
    const projectRoot = path.resolve(process.cwd(), "..");
    const evidenceRoot = path.join(projectRoot, "evidence_store", "demo-tenant");

    const packages: any[] = [];

    if (!fs.existsSync(evidenceRoot)) {
      return NextResponse.json([]);
    }

    const folders = fs
      .readdirSync(evidenceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    for (const folder of folders) {
      const packageDir = path.join(evidenceRoot, folder.name);

      const metadata = readJson(path.join(packageDir, "metadata.json"));
      const hits = readJson(path.join(packageDir, "hits_output.json"));
      const screening = readJson(path.join(packageDir, "screening_output.json"));
      const intake = readJson(path.join(packageDir, "intake_input.json"));
      const state = readJson(path.join(packageDir, "workflow_state.json"));

      packages.push({
        package_id: folder.name,
        pmid: metadata?.pmid || folder.name.replace("PMID_", ""),
        title: metadata?.title || "—",
        status: state?.status || "NEW",
        updated_at: state?.updated_at || "—",
        hits_count: hits?.hits_count || 0,
        screening_count: screening?.screening_count || 0,
        intake_input_count: intake?.intake_input_count || 0,
      });
    }

    return NextResponse.json(packages);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to list workflow packages",
      },
      { status: 500 }
    );
  }
}