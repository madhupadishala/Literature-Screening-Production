"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  KnowledgeGraph,
  KnowledgeGraphStatus,
} from "@/lib/knowledge/graph/knowledge-graph-types";

interface ApiResponse {
  status: KnowledgeGraphStatus;
  graphs: KnowledgeGraph[];
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function KnowledgeGraphDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadGraphs() {
    const response = await fetch("/api/knowledge/graph", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function createDemoGraph() {
    await fetch("/api/knowledge/graph", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentId: "demo-gvp-vi",
        nodes: [
          {
            id: "node-valid-icsr",
            title: "Valid ICSR",
            type: "definition",
          },
          {
            id: "node-patient",
            title: "Identifiable Patient",
            type: "criterion",
          },
          {
            id: "node-reporter",
            title: "Identifiable Reporter",
            type: "criterion",
          },
          {
            id: "node-product",
            title: "Suspect Product",
            type: "criterion",
          },
          {
            id: "node-event",
            title: "Adverse Event",
            type: "criterion",
          },
        ],
      }),
    });

    await loadGraphs();
  }

  useDeferredLoad(loadGraphs);

  const status = data?.status;
  const graphs = data?.graphs ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Knowledge Graph
          </h2>

          <p className="text-sm text-slate-500">
            Links structured knowledge objects into relationships for
            explainable AI reasoning.
          </p>
        </div>

        <button
          type="button"
          onClick={createDemoGraph}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Create Demo Graph
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Graphs"
          value={status?.totalGraphs ?? 0}
        />

        <MetricCard
          title="Nodes"
          value={status?.totalNodes ?? 0}
        />

        <MetricCard
          title="Edges"
          value={status?.totalEdges ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Generated Graphs
        </div>

        <div className="divide-y divide-slate-100">
          {graphs.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No knowledge graphs generated.
            </div>
          ) : (
            graphs.map((graph) => (
              <div key={graph.id} className="space-y-3 p-4">
                <div className="font-semibold text-slate-900">
                  Document: {graph.documentId}
                </div>

                <div className="text-sm text-slate-500">
                  Nodes: {graph.nodes.length} · Edges: {graph.edges.length} ·{" "}
                  Generated: {new Date(graph.generatedAt).toLocaleString()}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {graph.nodes.map((node) => (
                    <div
                      key={node.id}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="font-semibold text-slate-900">
                        {node.title}
                      </div>

                      <div className="text-xs uppercase text-slate-400">
                        {node.type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
