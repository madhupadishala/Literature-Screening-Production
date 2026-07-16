import { NextRequest, NextResponse } from "next/server";

import {
  hitsAgent,
  type HitsAgentRequest,
} from "@/lib/ai/hits-agent";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HitsAgentRequest;

    const result = await hitsAgent.evaluate(body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Hits AI Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown Hits AI error",
      },
      {
        status: 500,
      },
    );
  }
}