import { screeningEngine } from "./screening-engine";

import type {
  ScreeningRequest,
  ScreeningResponse,
  ScreeningStatus,
} from "./screening-types";

import { screeningAgent } from "@/lib/ai/screening-agent";
import { screeningValidator } from "@/lib/ai/screening-validator";

class ScreeningService {
  private history: ScreeningResponse[] = [];

  async screenArticle(
    request: ScreeningRequest,
  ): Promise<ScreeningResponse> {

    //-----------------------------------------
    // 1. Rule Engine
    //-----------------------------------------

    const ruleDecision =
      screeningEngine.screen(request);

    //-----------------------------------------
    // 2. AI Decision
    //-----------------------------------------

    let finalDecision =
      ruleDecision;

    try {

      const aiDecision =
        await screeningAgent.screen(
          request,
        );

      finalDecision =
        screeningValidator.validate(
          aiDecision,
        );

    } catch (error) {

      console.warn(
        "AI Screening unavailable. Falling back to rule engine.",
        error,
      );

      finalDecision =
        screeningValidator.validate(
          ruleDecision,
        );
    }

    //-----------------------------------------
    // 3. History
    //-----------------------------------------

    this.history.unshift(
      finalDecision,
    );

    return finalDecision;
  }

  list(
    limit = 50,
  ): ScreeningResponse[] {

    return this.history.slice(
      0,
      limit,
    );
  }

  getByPmid(
    pmid: string,
  ) {

    return this.history.find(
      x => x.pmid === pmid,
    );
  }

  clear(): void {

    this.history = [];
  }

  getStatus(): ScreeningStatus {

    const included =
      this.history.filter(
        x => x.decision === "INCLUDE",
      ).length;

    const excluded =
      this.history.filter(
        x => x.decision === "EXCLUDE",
      ).length;

    const review =
      this.history.filter(
        x => x.decision === "REVIEW",
      ).length;

    return {

      totalScreened:
        this.history.length,

      included,

      excluded,

      reviewRequired:
        review,

      lastScreenedAt:
        this.history[0]?.screenedAt,
    };
  }
}

export const screeningService =
  new ScreeningService();