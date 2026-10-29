"use client";
import type { ReactNode } from "react";
import type { useHits } from "./hooks/useHits";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
export type HitsModel = ReturnType<typeof useHits>;
export type SharedRenderProps = {
  model: HitsModel;
  parent: (key: string, title: string, children: ReactNode) => ReactNode;
  child: (key: string, title: string, content: ReactNode) => ReactNode;
  results: (kind: "dup" | "manual") => ReactNode;
};

export function ManualSearch({ model, parent, child, results }: SharedRenderProps) {
  const { query, setQuery, previewEnabled, run, db, setDb } = model;
  return parent(
    "manual",
    "02 · Hits Manual Search",
    <>
      {child(
        "manualForm",
        "2.1 Literature Manual Search",
        <div className="nh-fields">
          <label>
            Database
            <select value={db} onChange={(e) => setDb(e.target.value)}>
              <option>All</option>
              <option>PubMed</option>
              <option>Embase</option>
            </select>
          </label>
          <label>
            Search terms
            <Input value={query.manual} onChange={(e) => setQuery((q) => ({ ...q, manual: e.target.value }))} />
          </label>
          <Button disabled={!previewEnabled} onClick={() => run("manual")}>
            Search (preview)
          </Button>
        </div>,
      )}
      {child("manualResults", "2.2 Literature Manual Search Results", results("manual"))}
    </>,
  );
}
