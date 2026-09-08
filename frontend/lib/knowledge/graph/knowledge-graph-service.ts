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

  list(tenantId: string, limit = 20) {
    return this.graphs
      .filter((graph) => graph.tenantId === tenantId)
      .slice(0, limit);
  }

  getStatus(tenantId: string): KnowledgeGraphStatus {
    const tenantGraphs = this.graphs.filter(
      (graph) => graph.tenantId === tenantId,
    );
    return {
      totalGraphs: tenantGraphs.length,
      totalNodes: tenantGraphs.reduce(
        (sum, graph) => sum + graph.nodes.length,
        0,
      ),
      totalEdges: tenantGraphs.reduce(
        (sum, graph) => sum + graph.edges.length,
        0,
      ),
    };
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();