export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type PlatformComponent =
  | "database"
  | "authentication"
  | "storage"
  | "processing_engine"
  | "scheduler"
  | "jobs"
  | "rag"
  | "vector"
  | "ai_gateway"
  | "application";

export interface ServiceHeartbeat {
  serviceId: string;
  component: PlatformComponent;
  status: HealthStatus;
  message?: string;
  version?: string;
  checkedAt: string;
  uptimeSeconds: number;
  metadata?: Record<string, unknown>;
}

export interface ComponentHealth {
  component: PlatformComponent;
  status: HealthStatus;
  serviceCount: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  lastCheckedAt?: string;
}

export interface InfrastructureStatus {
  overall: HealthStatus;
  uptimeSeconds: number;
  generatedAt: string;
  services: ServiceHeartbeat[];
  components: ComponentHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  };
}