export interface FeatureFlag {
  key: string;

  description: string;

  enabled: boolean;

  updatedAt: string;
}

const featureFlags =
  new Map<string, FeatureFlag>();

export class FeatureFlagService {
  enable(
    key: string,
  ): FeatureFlag {
    return this.set(
      key,
      true,
    );
  }

  disable(
    key: string,
  ): FeatureFlag {
    return this.set(
      key,
      false,
    );
  }

  private set(
    key: string,
    enabled: boolean,
  ): FeatureFlag {
    const existing =
      featureFlags.get(key);

    const flag: FeatureFlag = {
      key,

      description:
        existing?.description ??
        key,

      enabled,

      updatedAt:
        new Date().toISOString(),
    };

    featureFlags.set(
      key,
      flag,
    );

    return flag;
  }

  register(
    key: string,
    description: string,
    enabled = false,
  ): FeatureFlag {
    const flag: FeatureFlag = {
      key,

      description,

      enabled,

      updatedAt:
        new Date().toISOString(),
    };

    featureFlags.set(
      key,
      flag);

    return flag;
  }

  isEnabled(
    key: string,
  ): boolean {
    return (
      featureFlags.get(key)
        ?.enabled ?? false
    );
  }

  list(): FeatureFlag[] {
    return Array.from(
      featureFlags.values(),
    );
  }

  seedDefaults(): void {
    if (
      featureFlags.size > 0
    ) {
      return;
    }

    this.register(
      "enterprise-rag",
      "Enterprise RAG Engine",
      true,
    );

    this.register(
      "vector-search",
      "Vector Database",
      true,
    );

    this.register(
      "hits-ai",
      "Hits AI Agent",
      true,
    );

    this.register(
      "screening-ai",
      "Screening AI",
      true,
    );

    this.register(
      "evidence-builder",
      "Evidence Package Builder",
      true,
    );

    this.register(
      "notification-center",
      "Notification Center",
      true,
    );

    this.register(
      "micc",
      "Medical Information",
      false,
    );

    this.register(
      "clinical-trials",
      "Clinical Trial Module",
      false,
    );

    this.register(
      "social-media",
      "Social Media Module",
      false,
    );

    this.register(
      "regulatory-intelligence",
      "Regulatory Intelligence",
      false,
    );

    this.register(
      "legal",
      "Legal Cases",
      false,
    );
  }
}

export const featureFlagsService =
  new FeatureFlagService();