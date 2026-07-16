"use client";

import {
  useEffect,
  useState,
} from "react";

interface FeatureFlag {
  key: string;

  description: string;

  enabled: boolean;
}

export default function FeatureFlagPanel() {
  const [flags, setFlags] =
    useState<FeatureFlag[]>(
      [],
    );

  useEffect(() => {
    fetch(
      "/api/admin/settings?tenantId=demo-tenant",
    )
      .then((response) =>
        response.json(),
      )
      .then((json) =>
        setFlags(
          json.featureFlags,
        ),
      );
  }, []);

  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-6 text-2xl font-semibold">
        Enterprise Feature Flags
      </h2>

      <div className="space-y-3">

        {flags.map((flag) => (
          <div
            key={flag.key}
            className="flex items-center justify-between rounded-lg border p-4"
          >

            <div>

              <div className="font-semibold">
                {flag.description}
              </div>

              <div className="text-xs text-gray-500">
                {flag.key}
              </div>

            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                flag.enabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {flag.enabled
                ? "Enabled"
                : "Disabled"}
            </span>

          </div>
        ))}

      </div>

    </div>
  );
}