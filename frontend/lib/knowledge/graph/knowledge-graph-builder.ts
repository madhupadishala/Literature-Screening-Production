import type {
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeGraphRequest,
} from "./knowledge-graph-types";

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export class KnowledgeGraphBuilder {
  build(request: KnowledgeGraphRequest): KnowledgeGraph {
    const edges: KnowledgeEdge[] = [];

    for (let index = 0; index < request.nodes.length - 1; index++) {
      edges.push({
        id: createId("edge"),
        sourceNodeId: request.nodes[index].id,
        targetNodeId: request.nodes[index + 1].id,
        relationship: "related_to",
      });
    }

    return {
      id: createId("graph"),
      documentId: request.documentId,
      nodes: request.nodes,
      edges,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const knowledgeGraphBuilder = new KnowledgeGraphBuilder();