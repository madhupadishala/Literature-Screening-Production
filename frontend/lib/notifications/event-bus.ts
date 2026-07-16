import {
  notificationStore,
  type NotificationCategory,
  type NotificationRecord,
  type NotificationSeverity,
} from "./notification-store";

export type EnterpriseEventType =
  | "assignment.created"
  | "assignment.overdue"
  | "review.required"
  | "review.completed"
  | "sla.breached"
  | "ai.low_confidence"
  | "workflow.completed"
  | "workflow.blocked"
  | "evidence.generated"
  | "evidence.approved"
  | "system.health_warning";

export interface EnterpriseEvent {
  tenantId: string;
  userId?: string;
  type: EnterpriseEventType;
  title: string;
  message: string;
  sourceModule?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

function severityForEvent(type: EnterpriseEventType): NotificationSeverity {
  if (type === "sla.breached" || type === "workflow.blocked") {
    return "critical";
  }

  if (type === "ai.low_confidence" || type === "system.health_warning") {
    return "warning";
  }

  if (
    type === "review.completed" ||
    type === "workflow.completed" ||
    type === "evidence.approved"
  ) {
    return "success";
  }

  return "info";
}

function categoryForEvent(type: EnterpriseEventType): NotificationCategory {
  if (type.startsWith("assignment.")) {
    return "assignment";
  }

  if (type.startsWith("review.")) {
    return "review";
  }

  if (type.startsWith("sla.")) {
    return "sla";
  }

  if (type.startsWith("ai.")) {
    return "ai";
  }

  if (type.startsWith("workflow.")) {
    return "workflow";
  }

  if (type.startsWith("evidence.")) {
    return "evidence";
  }

  return "system";
}

export class EnterpriseEventBus {
  publish(event: EnterpriseEvent): NotificationRecord {
    return notificationStore.create({
      tenantId: event.tenantId,
      userId: event.userId,
      title: event.title,
      message: event.message,
      category: categoryForEvent(event.type),
      severity: severityForEvent(event.type),
      sourceModule: event.sourceModule,
      sourceId: event.sourceId,
      metadata: {
        eventType: event.type,
        ...event.metadata,
      },
    });
  }

  seedDemoEvents(tenantId: string): void {
    const existing = notificationStore.list(tenantId);

    if (existing.length > 0) {
      return;
    }

    this.publish({
      tenantId,
      type: "review.required",
      title: "Screening review required",
      message: "A literature screening case is waiting for human review.",
      sourceModule: "screening",
      sourceId: "screening-demo-001",
    });

    this.publish({
      tenantId,
      type: "ai.low_confidence",
      title: "Low AI confidence detected",
      message: "AI confidence is below the configured review threshold.",
      sourceModule: "ai",
      sourceId: "ai-demo-001",
      metadata: {
        confidence: 0.54,
      },
    });

    this.publish({
      tenantId,
      type: "sla.breached",
      title: "SLA breach detected",
      message: "A serious case has exceeded the configured workflow SLA.",
      sourceModule: "workflow",
      sourceId: "workflow-demo-001",
    });
  }
}

export const enterpriseEventBus = new EnterpriseEventBus();