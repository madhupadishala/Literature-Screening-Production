import { knowledgeGraphBuilder } from "./knowledge-graph-builder";

import type {
  KnowledgeGraph,
  KnowledgeGraphRequest,
  KnowledgeGraphStatus,
} from "./knowledge-graph-types";

class KnowledgeGraphService {
  private graphs: KnowledgeGraph[] = [];

  build(request: KnowledgeGraphRequest) {
    const graph = knowledgeGraphBuilder.build(request);

    this.graphs.unshift(graph);

    return graph;
  }

  list(limit = 20) {
    return this.graphs.slice(0, limit);
  }

  getStatus(): KnowledgeGraphStatus {
    return {
      totalGraphs: this.graphs.length,
      totalNodes: this.graphs.reduce(
        (sum, graph) => sum + graph.nodes.length,
        0,
      ),
      totalEdges: this.graphs.reduce(
        (sum, graph) => sum + graph.edges.length,
        0,
      ),
    };
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();