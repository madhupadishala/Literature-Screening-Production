import { NextRequest, NextResponse } from "next/server";

import {
  buildEvidenceContext,
  type EvidenceContextPurpose,
} from "@/lib/ai/evidence-context-builder";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const context = buildEvidenceContext({
      tenantId: body.tenantId,
      purpose: (body.purpose ?? "screening") as EvidenceContextPurpose,
      query: body.query,
      sourceId: body.sourceId,
      sourceTitle: body.sourceTitle,
      sourceAbstract: body.sourceAbstract,
      sourceFullText: body.sourceFullText,
      metadata: body.metadata,
    });

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to build evidence context.",
      },
      {
        status: 500,
      }
    );
  }
}