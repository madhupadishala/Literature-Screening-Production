import "server-only";

import {
  isNexusEnvironment,
  type NexusEnvironment,
} from "@/lib/nexus/entitlement-types";

export function getDefaultNexusEnvironment(): NexusEnvironment {
  const configured = process.env.NEXUS_DEFAULT_ENVIRONMENT?.trim().toUpperCase();
  if (configured && isNexusEnvironment(configured)) {
    return configured;
  }

  return "PROD";
}
