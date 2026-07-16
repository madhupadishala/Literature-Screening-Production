import { NextRequest, NextResponse } from "next/server";

import { searchKnowledge } from "@/lib/knowledge/knowledge-router";

import type { KnowledgeSearchRequest } from "@/lib/knowledge/knowledge-types";

export async function POST(request: NextRequest) {
  try {
    const body =
      (await request.json()) as KnowledgeSearchRequest;

    if (!body.tenantId || !body.query) {
      return NextResponse.json(
        {
          success: false,
          message: "tenantId and query are required.",
        },
        { status: 400 }
      );
    }

    const results = searchKnowledge(body);

    return NextResponse.json({
      success: true,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Knowledge search failed.",
      },
      { status: 500 }
    );
  }
}