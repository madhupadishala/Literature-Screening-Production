import { NextResponse } from "next/server";

import {
  calculateSecurityScore,
  checkRequiredEnvironment,
} from "@/lib/readiness/security-utils";

export async function GET() {
  try {
    const checks = checkRequiredEnvironment();

    const score = calculateSecurityScore(checks);

    return NextResponse.json({
      success: true,

      readiness: {
        score,

        productionReady: score >= 80,

        generatedAt:
          new Date().toISOString(),

        checks,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      },
    );
  }
}