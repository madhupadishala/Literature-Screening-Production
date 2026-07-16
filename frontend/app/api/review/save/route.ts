import { NextRequest, NextResponse } from "next/server";

import { reviewRepository } from "@/lib/review/review-store";
import type { SaveReviewRequest } from "@/lib/review/review-types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveReviewRequest;

    const result = reviewRepository.save(body.review);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Review Save Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown review save error",
      },
      {
        status: 500,
      },
    );
  }
}