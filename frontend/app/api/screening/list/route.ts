import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const projectRoot = path.resolve(process.cwd(), "..");
    const evidenceRoot = path.join(
      projectRoot,
      "evidence_store",
      "demo-tenant"
    );

    const rows: any[] = [];

    if (!fs.existsSync(evidenceRoot)) {
      return NextResponse.json(rows);
    }

    const pmidFolders = fs
      .readdirSync(evidenceRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const folder of pmidFolders) {
      const packageDir = path.join(evidenceRoot, folder.name);

      const screeningFile = path.join(
        packageDir,
        "screening_output.json"
      );

      const hitsFile = path.join(
        packageDir,
        "hits_output.json"
      );

      if (!fs.existsSync(screeningFile)) continue;

      const screening = JSON.parse(
        fs.readFileSync(screeningFile, "utf8")
      );

      const hits = fs.existsSync(hitsFile)
        ? JSON.parse(fs.readFileSync(hitsFile, "utf8"))
        : { hits: [] };

      const hit = hits.hits?.[0] ?? {};

      for (const row of screening.screening ?? []) {
        rows.push({
          ...hit,
          ...row,
        });
      }
    }

    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      {
        error: "Unable to load screening output",
      },
      {
        status: 500,
      }
    );
  }
}