import { healthService } from "./health-service";

let bootstrapped = false;

export function bootstrapPlatformMonitoring() {
  if (bootstrapped) {
    return healthService.getStatus();
  }

  healthService.registerService({
    serviceId: "clinixai-application",
    component: "application",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "auth-session-manager",
    component: "authentication",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "database-foundation",
    component: "database",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "enterprise-document-management",
    component: "storage",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "enterprise-processing-engine",
    component: "processing_engine",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "scheduler-engine",
    component: "scheduler",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "enterprise-rag",
    component: "rag",
    version: "production-alpha",
  });

  healthService.registerService({
    serviceId: "vector-foundation",
    component: "vector",
    version: "production-alpha",
  });

  bootstrapped = true;

  return healthService.getStatus();
}

export function getPlatformHealth() {
  bootstrapPlatformMonitoring();

  return healthService.getStatus();
}