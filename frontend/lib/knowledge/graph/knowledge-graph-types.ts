export type KnowledgeRelationshipType =
  | "references"
  | "defines"
  | "depends_on"
  | "extends"
  | "supersedes"
  | "related_to"
  | "implements"
  | "contradicts";

export interface KnowledgeNode {
  id: string;
  title: string;
  type: string;
}

export interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: KnowledgeRelationshipType;
}

export interface KnowledgeGraph {
  id: string;
  documentId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  generatedAt: string;
}

export interface KnowledgeGraphRequest {
  documentId: string;
  nodes: KnowledgeNode[];
}

export interface KnowledgeGraphStatus {
  totalGraphs: number;
  totalNodes: number;
  totalEdges: number;
}