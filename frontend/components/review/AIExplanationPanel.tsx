"use client";

interface AIExplanationPanelProps {
  confidence: number;
  reasons: string[];
  evidence?: string[];
  modelName?: string;
  promptVersion?: string;
}

export default function AIExplanationPanel({
  confidence,
  reasons,
  evidence = [],
  modelName,
  promptVersion,
}: AIExplanationPanelProps) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">
        AI Explanation
      </h2>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">
            Confidence
          </div>

          <div className="text-3xl font-bold">
            {(confidence * 100).toFixed(0)}%
          </div>
        </div>

        <div className="text-right text-sm text-gray-500">
          <div>{modelName ?? "Mock Model"}</div>
          <div>{promptVersion ?? "Prompt v1"}</div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">
          AI Reasoning
        </h3>

        <ul className="list-disc space-y-2 pl-5 text-sm">
          {reasons.length === 0 ? (
            <li>No reasoning available.</li>
          ) : (
            reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))
          )}
        </ul>
      </div>

      {evidence.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-semibold">
            Supporting Evidence
          </h3>

          <ul className="list-disc space-y-2 pl-5 text-sm">
            {evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}