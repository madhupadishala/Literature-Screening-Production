export type ReportMetricType =
  | "hits"
  | "screening"
  | "intake"
  | "qc"
  | "workflow"
  | "ai"
  | "seriousness"
  | "sla"
  | "override";

export interface ReportMetric {
  id: string;
  tenantId: string;
  metricType: ReportMetricType;
  label: string;
  value: number;
  unit?: string;
  productName?: string;
  workflowStage?: string;
  country?: string;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

export interface ReportMetricInput {
  tenantId: string;
  metricType: ReportMetricType;
  label: string;
  value: number;
  unit?: string;
  productName?: string;
  workflowStage?: string;
  country?: string;
  metadata?: Record<string, unknown>;
}

const reportMetrics = new Map<string, ReportMetric>();

function createMetricId(): string {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ReportStore {
  record(input: ReportMetricInput): ReportMetric {
    const metric: ReportMetric = {
      ...input,
      id: createMetricId(),
      recordedAt: new Date().toISOString(),
    };

    reportMetrics.set(metric.id, metric);

    return metric;
  }

  list(tenantId: string): ReportMetric[] {
    return Array.from(reportMetrics.values()).filter(
      (metric) => metric.tenantId === tenantId,
    );
  }

  listByType(tenantId: string, metricType: ReportMetricType): ReportMetric[] {
    return this.list(tenantId).filter(
      (metric) => metric.metricType === metricType,
    );
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, metric] of reportMetrics.entries()) {
      if (metric.tenantId === tenantId) {
        reportMetrics.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export const reportStore = new ReportStore();