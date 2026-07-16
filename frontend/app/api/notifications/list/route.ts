import { NextRequest, NextResponse } from "next/server";

import { enterpriseEventBus } from "@/lib/notifications/event-bus";
import { notificationStore } from "@/lib/notifications/notification-store";

export async function GET(request: NextRequest) {
  try {
    const tenantId =
      request.nextUrl.searchParams.get("tenantId") ?? "demo-tenant";

    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;

    enterpriseEventBus.seedDemoEvents(tenantId);

    const notifications = notificationStore.list(tenantId, userId);
    const unreadCount = notificationStore.unreadCount(tenantId, userId);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Notification List Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown notification list error",
      },
      { status: 500 },
    );
  }
}