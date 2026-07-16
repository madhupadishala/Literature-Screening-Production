"use client";

import { useEffect, useState } from "react";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch("/api/notifications/list?tenantId=demo-tenant")
      .then((response) => response.json())
      .then((json) => setUnreadCount(json.data?.unreadCount ?? 0));
  }, []);

  return (
    <div className="relative inline-flex items-center">
      <span className="text-xl">🔔</span>

      {unreadCount > 0 && (
        <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
          {unreadCount}
        </span>
      )}
    </div>
  );
}