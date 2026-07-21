"use client";

import { useState } from "react";

export default function PackageAIContextPanel() {
  const [context, setContext] = useState<unknown>(null);

  async function loadContext() {
    const response = await fetch("/api/ai/package-context", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        purpose: "screening",
        query: "Paracetamol hepatotoxicity",
      }),
    });

    const data: unknown = await response.json();

    setContext(
      typeof data === "object" && data !== null && "context" in data
        ? data.context
        : null,
    );
  }

  return (
    <section>
      <h2>AI Evidence Context</h2>

      <button onClick={loadContext}>
        Build Evidence Package
      </button>

      {context !== null && (
        <pre
          style={{
            marginTop: 20,
            overflow: "auto",
            maxHeight: 600,
            background: "#111827",
            color: "#f9fafb",
            padding: 16,
            borderRadius: 8,
          }}
        >
          {JSON.stringify(context, null, 2)}
        </pre>
      )}
    </section>
  );
}
