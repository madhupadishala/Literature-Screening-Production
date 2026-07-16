import type {
  HealthStatus,
  InfrastructureStatus,
  PlatformComponent,
  ServiceHeartbeat,
} from "./health-types";

const startedAt = Date.now();

function getUptimeSeconds() {
  return Math.floor((Date.now() - startedAt) / 1000);
}

function resolveOverallStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("unhealthy")) {
    return "unhealthy";
  }

  if (statuses.includes("degraded")) {
    return "degraded";
  }

  if (statuses.includes("unknown")) {
    return "unknown";
  }

  return "healthy";
}

class HealthService {
  private services = new Map<string, ServiceHeartbeat>();

  registerService(input: {
    serviceId: string;
    component: PlatformComponent;
    version?: string;
    metadata?: Record<string, unknown>;
  }) {
    const heartbeat: ServiceHeartbeat = {
      serviceId: input.serviceId,
      component: input.component,
      status: "healthy",
      version: input.version ?? "alpha",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: getUptimeSeconds(),
      metadata: input.metadata,
    };

    this.services.set(input.serviceId, heartbeat);
    return heartbeat;
  }

  updateHeartbeat(
    serviceId: string,
    status: HealthStatus,
    message?: string,
    metadata?: Record<string, unknown>,
  ) {
    const existing = this.services.get(serviceId);

    const heartbeat: ServiceHeartbeat = {
      serviceId,
      component: existing?.component ?? "application",
      status,
      message,
      version: existing?.version ?? "alpha",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: getUptimeSeconds(),
      metadata: {
        ...existing?.metadata,
        ...metadata,
      },
    };

    this.services.set(serviceId, heartbeat);
    return heartbeat;
  }

  listServices() {
    return Array.from(this.services.values()).sort((a, b) =>
      a.serviceId.localeCompare(b.serviceId),
    );
  }

  getStatus(): InfrastructureStatus {
    const services = this.listServices();

    const components = Array.from(
      new Set(services.map((service) => service.component)),
    ).map((component) => {
      const componentServices = services.filter(
        (service) => service.component === component,
      );

      return {
        component,
        status: resolveOverallStatus(
          componentServices.map((service) => service.status),
        ),
        serviceCount: componentServices.length,
        healthyCount: componentServices.filter(
          (service) => service.status === "healthy",
        ).length,
        degradedCount: componentServices.filter(
          (service) => service.status === "degraded",
        ).length,
        unhealthyCount: componentServices.filter(
          (service) => service.status === "unhealthy",
        ).length,
        lastCheckedAt: componentServices[0]?.checkedAt,
      };
    });

    const summary = {
      total: services.length,
      healthy: services.filter((service) => service.status === "healthy").length,
      degraded: services.filter((service) => service.status === "degraded")
        .length,
      unhealthy: services.filter((service) => service.status === "unhealthy")
        .length,
      unknown: services.filter((service) => service.status === "unknown").length,
    };

    return {
      overall: resolveOverallStatus(services.map((service) => service.status)),
      uptimeSeconds: getUptimeSeconds(),
      generatedAt: new Date().toISOString(),
      services,
      components,
      summary,
    };
  }
}

export const healthService = new HealthService();