import { NextResponse } from "next/server";

import { performanceMonitor } from "@/lib/monitoring/performance-monitor";
import { errorTracker } from "@/lib/monitoring/error-tracker";

export async function GET() {
  try {
    const performance = performanceMonitor.summary();

    const errors = errorTracker.countBySeverity();

    return NextResponse.json({
      success: true,

      generatedAt: new Date().toISOString(),

      system: {
        status: "healthy",
        uptime: process.uptime(),
      },

      performance,

      errors,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        status: "unhealthy",
      },
      {
        status: 500,
      },
    );
  }
}