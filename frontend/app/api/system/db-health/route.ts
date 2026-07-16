import { NextResponse } from "next/server";

import { databaseService } from "@/lib/db/database";
import { migrationRegistry } from "@/lib/db/migrations";

export async function GET() {
  try {
    migrationRegistry.seedDefaults();

    const health = await databaseService.health();

    return NextResponse.json({
      success: true,
      database: health,
      migrations: migrationRegistry.list(),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Database Health Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown database health error",
      },
      { status: 500 },
    );
  }
}