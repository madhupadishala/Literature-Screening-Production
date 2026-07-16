export interface TenantConfiguration {
  tenantId: string;

  organizationName: string;

  environment:
    | "development"
    | "uat"
    | "production";

  timezone: string;

  defaultCountry?: string;

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

    logo?: string;

    primaryColor?: string;
  };

  updatedAt: string;
}

const configurationStore =
  new Map<string, TenantConfiguration>();

export class ConfigurationStore {
  upsert(
    configuration: TenantConfiguration,
  ): TenantConfiguration {
    const updated: TenantConfiguration = {
      ...configuration,

      updatedAt:
        new Date().toISOString(),
    };

    configurationStore.set(
      configuration.tenantId,
      updated,
    );

    return updated;
  }

  get(
    tenantId: string,
  ): TenantConfiguration | undefined {
    return configurationStore.get(
      tenantId,
    );
  }

  list(): TenantConfiguration[] {
    return Array.from(
      configurationStore.values(),
    );
  }

  seedDemoTenant(): void {
    if (
      configurationStore.has(
        "demo-tenant",
      )
    ) {
      return;
    }

    this.upsert({
      tenantId: "demo-tenant",

      organizationName:
        "ClinixAI Demo",

      environment:
        "development",

      timezone:
        "Asia/Kolkata",

      defaultCountry:
        "India",

      ai: {
        defaultModel:
          "gpt-5",

        defaultPromptVersion:
          "v1",

        enableRAG: true,

        enableVectorSearch:
          true,
      },

      workflow: {
        autoAssignment:
          true,

        requireQC: true,

        requireHumanReview:
          true,
      },

      branding: {
        applicationName:
          "ClinixAI Literature",

        primaryColor:
          "#2563eb",
      },

      updatedAt:
        new Date().toISOString(),
    });
  }
}

export const configurationStoreService =
  new ConfigurationStore();