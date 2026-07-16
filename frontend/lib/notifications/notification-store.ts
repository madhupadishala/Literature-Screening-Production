export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

export type NotificationStatus =
  | "unread"
  | "read"
  | "archived";

export type NotificationCategory =
  | "assignment"
  | "review"
  | "sla"
  | "ai"
  | "workflow"
  | "evidence"
  | "system";

export interface NotificationRecord {
  id: string;
  tenantId: string;
  userId?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  status: NotificationStatus;
  sourceModule?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
}

export interface CreateNotificationInput {
  tenantId: string;
  userId?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  sourceModule?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

const notifications = new Map<string, NotificationRecord>();

function createNotificationId(): string {
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class NotificationStore {
  create(input: CreateNotificationInput): NotificationRecord {
    const notification: NotificationRecord = {
      ...input,
      id: createNotificationId(),
      severity: input.severity ?? "info",
      status: "unread",
      createdAt: new Date().toISOString(),
    };

    notifications.set(notification.id, notification);

    return notification;
  }

  list(tenantId: string, userId?: string): NotificationRecord[] {
    return Array.from(notifications.values())
      .filter((notification) => notification.tenantId === tenantId)
      .filter((notification) => !userId || notification.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  unreadCount(tenantId: string, userId?: string): number {
    return this.list(tenantId, userId).filter(
      (notification) => notification.status === "unread",
    ).length;
  }

  markRead(notificationId: string): boolean {
    const notification = notifications.get(notificationId);

    if (!notification) {
      return false;
    }

    notifications.set(notificationId, {
      ...notification,
      status: "read",
      readAt: new Date().toISOString(),
    });

    return true;
  }

  archive(notificationId: string): boolean {
    const notification = notifications.get(notificationId);

    if (!notification) {
      return false;
    }

    notifications.set(notificationId, {
      ...notification,
      status: "archived",
    });

    return true;
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, notification] of notifications.entries()) {
      if (notification.tenantId === tenantId) {
        notifications.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export const notificationStore = new NotificationStore();