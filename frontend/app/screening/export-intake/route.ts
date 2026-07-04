import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const projectRoot = path.resolve(process.cwd(), "..");
    const evidenceRoot = path.join(projectRoot, "evidence_store", "demo-tenant");

    const intakePackages: any[] = [];

    if (fs.existsSync(evidenceRoot)) {
      const folders = fs
        .readdirSync(evidenceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

      for (const folder of folders) {
        const packageDir = path.join(evidenceRoot, folder.name);
        const intakePath = path.join(packageDir, "intake_input.json");

        if (!fs.existsSync(intakePath)) continue;

        const intakePayload = JSON.parse(fs.readFileSync(intakePath, "utf8"));

        for (const row of intakePayload.intake_inputs ?? []) {
          intakePackages.push(row);
        }
      }
    }

    return new NextResponse(JSON.stringify(intakePackages, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="clinixai-intake-input-package.json"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to export intake input package" },
      { status: 500 }
    );
  }
}