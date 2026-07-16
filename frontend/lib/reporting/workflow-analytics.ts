import {
  reportStore,
  type ReportMetric,
  type ReportMetricType,
} from "./report-store";

export interface WorkflowAnalyticsSummary {
  tenantId: string;
  generatedAt: string;
  totals: {
    hits: number;
    screening: number;
    intake: number;
    qc: number;
    serious: number;
    overrides: number;
  };
  ai: {
    averageConfidence: number;
    lowConfidenceCount: number;
  };
  sla: {
    totalTracked: number;
    breached: number;
    breachRate: number;
  };
}

function sumByType(metrics: ReportMetric[], metricType: ReportMetricType): number {
  return metrics
    .filter((metric) => metric.metricType === metricType)
    .reduce((sum, metric) => sum + metric.value, 0);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class WorkflowAnalytics {
  buildSummary(tenantId: string): WorkflowAnalyticsSummary {
    const metrics = reportStore.list(tenantId);

    const aiConfidenceMetrics = metrics.filter(
      (metric) => metric.metricType === "ai" && metric.label === "confidence",
    );

    const slaMetrics = metrics.filter((metric) => metric.metricType === "sla");

    const breachedSla = slaMetrics.filter((metric) => metric.value > 0).length;

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      totals: {
        hits: sumByType(metrics, "hits"),
        screening: sumByType(metrics, "screening"),
        intake: sumByType(metrics, "intake"),
        qc: sumByType(metrics, "qc"),
        serious: sumByType(metrics, "seriousness"),
        overrides: sumByType(metrics, "override"),
      },
      ai: {
        averageConfidence: average(aiConfidenceMetrics.map((metric) => metric.value)),
        lowConfidenceCount: aiConfidenceMetrics.filter((metric) => metric.value < 0.6)
          .length,
      },
      sla: {
        totalTracked: slaMetrics.length,
        breached: breachedSla,
        breachRate: slaMetrics.length === 0 ? 0 : breachedSla / slaMetrics.length,
      },
    };
  }

  seedDemoMetrics(tenantId: string): void {
    const existing = reportStore.list(tenantId);

    if (existing.length > 0) {
      return;
    }

    reportStore.record({
      tenantId,
      metricType: "hits",
      label: "hits_processed",
      value: 128,
      unit: "count",
      workflowStage: "hits",
    });

    reportStore.record({
      tenantId,
      metricType: "screening",
      label: "screening_completed",
      value: 86,
      unit: "count",
      workflowStage: "screening",
    });

    reportStore.record({
      tenantId,
      metricType: "intake",
      label: "intake_completed",
      value: 42,
      unit: "count",
      workflowStage: "intake",
    });

    reportStore.record({
      tenantId,
      metricType: "qc",
      label: "qc_completed",
      value: 38,
      unit: "count",
      workflowStage: "qc",
    });

    reportStore.record({
      tenantId,
      metricType: "seriousness",
      label: "serious_dt_lt_susar",
      value: 11,
      unit: "count",
    });

    reportStore.record({
      tenantId,
      metricType: "override",
      label: "manual_overrides",
      value: 7,
      unit: "count",
    });

    reportStore.record({
      tenantId,
      metricType: "ai",
      label: "confidence",
      value: 0.82,
      unit: "ratio",
    });

    reportStore.record({
      tenantId,
      metricType: "ai",
      label: "confidence",
      value: 0.54,
      unit: "ratio",
    });

    reportStore.record({
      tenantId,
      metricType: "sla",
      label: "sla_breach",
      value: 1,
      unit: "boolean",
    });

    reportStore.record({
      tenantId,
      metricType: "sla",
      label: "sla_met",
      value: 0,
      unit: "boolean",
    });
  }
}

export const workflowAnalytics = new WorkflowAnalytics();