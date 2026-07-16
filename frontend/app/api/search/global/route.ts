import { NextRequest, NextResponse } from "next/server";

import { searchStore } from "@/lib/search/search-store";
import type { SearchRequest } from "@/lib/search/search-types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SearchRequest;

    searchStore.seedDemoRecords(body.tenantId);

    const result = searchStore.search(body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Global Search Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown global search error",
      },
      { status: 500 },
    );
  }
}