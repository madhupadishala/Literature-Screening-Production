"use client";

import { useState } from "react";

import type { ReviewDecision } from "@/lib/review/review-types";

interface ReviewerDecisionPanelProps {
  reviewId: string;
  tenantId: string;
  workflowStage: "hits" | "screening" | "intake" | "qc";
  aiExecution: {
    agentName: string;
    agentVersion: string;
    promptVersion: string;
    modelName: string;
    modelVersion: string;
    confidence: number;
    executedAt: string;
  };
  aiResult: unknown;
  evidence?: {
    sourceId: string;
    sourceType: string;
    description?: string;
  }[];
}

export default function ReviewerDecisionPanel({
  reviewId,
  tenantId,
  workflowStage,
  aiExecution,
  aiResult,
  evidence = [],
}: ReviewerDecisionPanelProps) {
  const [decision, setDecision] =
    useState<ReviewDecision>("accept_ai");

  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveDecision() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/review/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          review: {
            id: reviewId,
            tenantId,
            workflowStage,
            status:
              decision === "accept_ai"
                ? "approved"
                : decision === "reject_case"
                  ? "rejected"
                  : "overridden",
            aiExecution,
            aiResult,
            evidence,
            reviewerDecision: {
              reviewerId: "current-user",
              decision,
              comments,
              overrideReason,
              reviewedAt: new Date().toISOString(),
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });

      const json = await response.json();

      if (!json.success) {
        throw new Error(json.message);
      }

      setMessage("Review decision saved successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save review.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-xl font-semibold">
        Reviewer Decision
      </h2>

      <select
        className="mb-4 w-full rounded-md border p-2"
        value={decision}
        onChange={(event) =>
          setDecision(event.target.value as ReviewDecision)
        }
      >
        <option value="accept_ai">
          Accept AI Recommendation
        </option>

        <option value="override_ai">
          Override AI
        </option>

        <option value="reject_case">
          Reject Case
        </option>

        <option value="needs_second_review">
          Needs Second Review
        </option>
      </select>

      <textarea
        className="mb-4 w-full rounded-md border p-2"
        rows={4}
        placeholder="Reviewer comments"
        value={comments}
        onChange={(event) => setComments(event.target.value)}
      />

      {decision === "override_ai" && (
        <textarea
          className="mb-4 w-full rounded-md border p-2"
          rows={3}
          placeholder="Reason for override"
          value={overrideReason}
          onChange={(event) =>
            setOverrideReason(event.target.value)
          }
        />
      )}

      <button
        className="rounded-md bg-indigo-600 px-5 py-2 text-white disabled:opacity-60"
        disabled={saving}
        onClick={saveDecision}
      >
        {saving ? "Saving..." : "Save Decision"}
      </button>

      {message && (
        <div className="mt-4 rounded-md bg-slate-100 p-3 text-sm">
          {message}
        </div>
      )}
    </div>
  );
}