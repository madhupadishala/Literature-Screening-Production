"use client";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import type { HitsModel } from "./DuplicateCheck";
export function MyAssignments({ model }: { model: HitsModel }) {
  const { open, toggle, queue, assigned, showActions } = model;
  return (
    <section className="nh-parent">
      <button className="nh-parenthead" type="button" aria-expanded={open.mine} onClick={() => toggle("mine")}>
        04 · My Assignments <span>{open.mine ? "−" : "+"}</span>
      </button>
      {open.mine && (
        <div className="nh-parentbody">
          <p className="nh-disclaimer">
            Assignments are loaded from the server for the active workspace; unavailable results are not substituted with preview data.
          </p>
          <div className="nh-scroll">
            <table className="nh-table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Product</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue
                  .filter((x) => assigned.includes(x.id))
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{x.id}</td>
                      <td>{x.product}</td>
                      <td>{x.title}</td>
                      <td>Assigned</td>
                      <td>
                        <button type="button" onClick={() => showActions(x.id)}>
                          Actions
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!assigned.length && <p className="nh-empty">No assignments.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
