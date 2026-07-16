import { NextRequest, NextResponse } from "next/server";

import {
  screeningAgent,
  type ScreeningAgentRequest,
} from "@/lib/ai/screening-agent";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ScreeningAgentRequest;

    const result = await screeningAgent.evaluate(body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Screening AI Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown screening AI error",
      },
      {
        status: 500,
      },
    );
  }
}