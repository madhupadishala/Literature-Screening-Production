export type ControlledKnowledgeSearchMode = "semantic" | "keyword" | "hybrid";

export interface ControlledKnowledgeSearchRequest {
  tenantId: string;
  query: string;
  topK?: number;
  minScore?: number;
  mode?: ControlledKnowledgeSearchMode;
  domains?: string[];
  knowledgeObjectIds?: string[];
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}

export interface GovernedKnowledgeCitation {
  citationId: string;
  knowledgeObjectId: string;
  chunkId: string;
  title: string;
  domain: string;
  section: string;
  version: string;
  regulatoryReference: string;
  sourceFile: string;
  contentHashSha256: string;
  repositoryVersion: string;
  repositoryManifestSha256: string;
}

export interface ControlledKnowledgeSearchResult {
  content: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
  matchedBy: ControlledKnowledgeSearchMode;
  citation: GovernedKnowledgeCitation;
}

export interface ControlledKnowledgeSearchResponse {
  tenantId: string;
  tenantKey: string;
  query: string;
  mode: ControlledKnowledgeSearchMode;
  repositoryId: string;
  repositoryVersion: string;
  embeddingModel: string;
  embeddingDimensions: number;
  results: ControlledKnowledgeSearchResult[];
  generatedAt: string;
}

export interface AgentContextPack {
  contextPackId: string;
  tenantId: string;
  tenantKey: string;
  query: string;
  repositoryId: string;
  repositoryVersion: string;
  repositoryManifestSha256: string;
  governedContext: string;
  results: ControlledKnowledgeSearchResult[];
  citations: GovernedKnowledgeCitation[];
  generatedAt: string;
}
