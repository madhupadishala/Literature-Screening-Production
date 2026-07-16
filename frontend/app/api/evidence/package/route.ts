import { NextRequest, NextResponse } from "next/server";

import { evidencePackageGenerator } from "@/lib/evidence/evidence-package-generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const evidencePackage = evidencePackageGenerator.build(body);

    return NextResponse.json({
      success: true,
      data: evidencePackage,
    });
  } catch (error) {
    console.error("Evidence Package Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown evidence package error",
      },
      { status: 500 },
    );
  }
}