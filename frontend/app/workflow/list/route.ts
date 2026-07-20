import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Adjust this base path to point to your data packages directory
const PACKAGES_DIR = path.join(process.cwd(), "..", "data", "packages");

export async function GET(request: NextRequest) {
  try {
    try {
      await fs.access(PACKAGES_DIR);
    } catch {
      return NextResponse.json({ success: true, packages: [] });
    }

    const dirEntries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true });
    const packageDirs = dirEntries.filter((entry) => entry.isDirectory());

    const packagesSummaryList = await Promise.all(
      packageDirs.map(async (dir) => {
        const packageId = dir.name;
        const packagePath = path.join(PACKAGES_DIR, packageId);

        async function readJsonSafely(fileName: string) {
          try {
            const content = await fs.readFile(path.join(packagePath, fileName), "utf-8");
            return JSON.parse(content);
          } catch {
            return null;
          }
        }

        const [workflowState, metadata, hitsOutput] = await Promise.all([
          readJsonSafely("workflow_state.json"),
          readJsonSafely("metadata.json"),
          readJsonSafely("hits_output.json"),
        ]);

        const status = workflowState?.status || workflowState?.state || "NEW";
        const updatedAt = workflowState?.updated_at || workflowState?.updatedAt || new Date().toISOString();
        const tenantId = metadata?.tenant_id || "default-tenant";
        const title = metadata?.title || hitsOutput?.hits?.[0]?.title || undefined;
        const pmid = metadata?.pmid || hitsOutput?.pmid || undefined;
        const hitsCount = hitsOutput?.hits_count ?? (Array.isArray(hitsOutput?.hits) ? hitsOutput.hits.length : 0);

        return {
          package_id: packageId,
          tenant_id: tenantId,
          status,
          updated_at: updatedAt,
          title,
          pmid,
          hits_count: hitsCount,
        };
      })
    );

    packagesSummaryList.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    return NextResponse.json({
      success: true,
      packages: packagesSummaryList,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to compile package inventory." },
      { status: 500 }
    );
  }
}