"use client";

import {
  useEffect,
  useState,
} from "react";

interface SettingsResponse {
  configuration: {
    organizationName: string;

    environment: string;

    timezone: string;

    ai: {
      defaultModel: string;

      defaultPromptVersion: string;

      enableRAG: boolean;

      enableVectorSearch: boolean;
    };

    workflow: {
      autoAssignment: boolean;

      requireQC: boolean;

      requireHumanReview: boolean;
    };

    branding: {
      applicationName: string;
    };
  };
}

export default function SystemSettingsPanel() {
  const [settings, setSettings] =
    useState<SettingsResponse | null>(
      null,
    );

  useEffect(() => {
    fetch(
      "/api/admin/settings?tenantId=demo-tenant",
    )
      .then((response) =>
        response.json(),
      )
      .then((json) =>
        setSettings(json),
      );
  }, []);

  if (!settings) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Loading...
      </div>
    );
  }

  const configuration =
    settings.configuration;

  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-6 text-2xl font-semibold">
        Enterprise Configuration
      </h2>

      <div className="grid gap-5 md:grid-cols-2">

        <Setting
          title="Organization"
          value={
            configuration.organizationName
          }
        />

        <Setting
          title="Environment"
          value={
            configuration.environment
          }
        />

        <Setting
          title="Timezone"
          value={
            configuration.timezone
          }
        />

        <Setting
          title="Application"
          value={
            configuration.branding
              .applicationName
          }
        />

        <Setting
          title="AI Model"
          value={
            configuration.ai
              .defaultModel
          }
        />

        <Setting
          title="Prompt Version"
          value={
            configuration.ai
              .defaultPromptVersion
          }
        />

        <Setting
          title="Vector Search"
          value={
            configuration.ai
              .enableVectorSearch
              ? "Enabled"
              : "Disabled"
          }
        />

        <Setting
          title="Enterprise RAG"
          value={
            configuration.ai
              .enableRAG
              ? "Enabled"
              : "Disabled"
          }
        />

      </div>

    </div>
  );
}

function Setting({
  title,
  value,
}: {
  title: string;

  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">

      <div className="text-sm text-gray-500">
        {title}
      </div>

      <div className="mt-2 text-lg font-semibold">
        {value}
      </div>

    </div>
  );
}