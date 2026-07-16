"use client";

import { useState } from "react";

export default function PackageAIContextPanel() {
  const [context, setContext] = useState<any>(null);

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

    const data = await response.json();

    setContext(data.context);
  }

  return (
    <section>
      <h2>AI Evidence Context</h2>

      <button onClick={loadContext}>
        Build Evidence Package
      </button>

      {context && (
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