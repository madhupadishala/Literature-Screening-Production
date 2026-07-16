import type {
  ReviewRecord,
  SaveReviewResponse,
} from "./review-types";

const reviewStore = new Map<string, ReviewRecord>();

function createReviewId(review: ReviewRecord): string {
  return review.id;
}

export class ReviewStore {
  save(review: ReviewRecord): SaveReviewResponse {
    const id = createReviewId(review);

    const existing = reviewStore.get(id);

    const record: ReviewRecord = {
      ...review,
      createdAt: existing?.createdAt ?? review.createdAt,
      updatedAt: new Date().toISOString(),
    };

    reviewStore.set(id, record);

    return {
      success: true,
      review: record,
    };
  }

  get(reviewId: string): ReviewRecord | undefined {
    return reviewStore.get(reviewId);
  }

  listByTenant(tenantId: string): ReviewRecord[] {
    return Array.from(reviewStore.values()).filter(
      (review) => review.tenantId === tenantId,
    );
  }

  listByWorkflow(
    tenantId: string,
    workflowStage: ReviewRecord["workflowStage"],
  ): ReviewRecord[] {
    return this.listByTenant(tenantId).filter(
      (review) => review.workflowStage === workflowStage,
    );
  }

  delete(reviewId: string): boolean {
    return reviewStore.delete(reviewId);
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, review] of reviewStore.entries()) {
      if (review.tenantId === tenantId) {
        reviewStore.delete(id);
        deleted++;
      }
    }

    return deleted;
  }
}

export const reviewRepository = new ReviewStore();