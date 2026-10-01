import type {
  PubMedWorkflowResult,
} from "@/lib/literature/pubmed/pubmed-service";

import type {
  DuplicateCheckResponse,
} from "@/lib/literature/duplicates/duplicate-types";

import type {
  ScreeningResponse,
} from "@/lib/literature/screening/screening-types";

import type {
  ArticleFetchWorkflowResponse,
} from "@/lib/literature/article-fetch/article-fetch-service";

export interface LiteratureWorkflowRequest {
  tenantId: string;
  workspaceId: string;
  environment: "PROD" | "UAT" | "TRAINING";

  query: string;

  maxResults?: number;
}

export interface LiteratureWorkflowArticle {
  searchResult: unknown;

  fetchResult?: ArticleFetchWorkflowResponse;

  duplicateResult?: DuplicateCheckResponse;

  screeningResult?: ScreeningResponse;
}

export interface LiteratureWorkflowResponse {
  tenantId: string;

  workspaceId: string;

  environment: "PROD" | "UAT" | "TRAINING";

  query: string;

  search: PubMedWorkflowResult;

  articles: LiteratureWorkflowArticle[];

  workflowStage: "WORKFLOW_COMPLETED";

  startedAt: string;

  completedAt: string;
}

export interface LiteratureWorkflowStatus {
  totalRuns: number;

  completedRuns: number;

  failedRuns: number;

  lastRunAt?: string;
}