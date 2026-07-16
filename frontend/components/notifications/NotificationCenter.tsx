"use client";

import { useEffect, useState } from "react";

import type { NotificationRecord } from "@/lib/notifications/notification-store";

interface NotificationResponse {
  notifications: NotificationRecord[];
  unreadCount: number;
  generatedAt: string;
}

function severityClass(severity: NotificationRecord["severity"]): string {
  if (severity === "critical") {
    return "border-red-200 bg-red-50";
  }

  if (severity === "warning") {
    return "border-amber-200 bg-amber-50";
  }

  if (severity === "success") {
    return "border-emerald-200 bg-emerald-50";
  }

  return "border-slate-200 bg-white";
}

function categoryIcon(category: NotificationRecord["category"]): string {
  const icons: Record<NotificationRecord["category"], string> = {
    assignment: "📌",
    review: "📝",
    sla: "⏱️",
    ai: "🤖",
    workflow: "🔁",
    evidence: "📦",
    system: "🖥️",
  };

  return icons[category];
}

export default function NotificationCenter() {
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications/list?tenantId=demo-tenant")
      .then((response) => response.json())
      .then((json) => setData(json.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Loading notifications...
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Notification Center</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enterprise events requiring attention
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold">
          {data.unreadCount} unread
        </div>
      </div>

      <div className="space-y-4">
        {data.notifications.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-gray-500">
            No notifications found.
          </div>
        ) : (
          data.notifications.map((notification) => (
            <div
              key={notification.id}
              className={`rounded-lg border p-4 ${severityClass(
                notification.severity,
              )}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-xl">
                  {categoryIcon(notification.category)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold">{notification.title}</h3>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium">
                      {notification.severity}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-700">
                    {notification.message}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{notification.category}</span>
                    <span>•</span>
                    <span>{notification.sourceModule ?? "system"}</span>
                    <span>•</span>
                    <span>{notification.status}</span>
                    <span>•</span>
                    <span>{new Date(notification.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}