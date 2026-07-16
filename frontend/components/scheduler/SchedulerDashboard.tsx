"use client";

import { useEffect, useState } from "react";
import type {
  ScheduleDefinition,
  SchedulerStatusResponse,
} from "@/lib/scheduler/scheduler-types";

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ScheduleDefinition["status"] }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      {status}
    </span>
  );
}

export default function SchedulerDashboard() {
  const [data, setData] = useState<SchedulerStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadSchedules() {
    setLoading(true);

    try {
      const response = await fetch("/api/scheduler/status", {
        cache: "no-store",
      });

      const result = (await response.json()) as SchedulerStatusResponse;
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  async function runDueSchedules() {
    await fetch("/api/scheduler/status", {
      method: "PATCH",
    });

    await loadSchedules();
  }

  useEffect(() => {
    void loadSchedules();
  }, []);

  const schedules = data?.schedules ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Scheduler Engine
          </h2>
          <p className="text-sm text-slate-500">
            Creates processing jobs from literature calendars, tenant schedules
            and recurring automation rules.
          </p>
        </div>

        <button
          type="button"
          onClick={runDueSchedules}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Run Due Schedules
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard title="Total" value={data?.total ?? 0} />
        <MetricCard title="Active" value={data?.active ?? 0} />
        <MetricCard title="Paused" value={data?.paused ?? 0} />
        <MetricCard title="Disabled" value={data?.disabled ?? 0} />
        <MetricCard title="Due Now" value={data?.dueNow ?? 0} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Schedule Registry {loading ? "· Loading..." : ""}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Job Type</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Next Run</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {schedules.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    No schedules configured.
                  </td>
                </tr>
              ) : (
                schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {schedule.name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {schedule.tenantId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {schedule.jobType}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {schedule.frequency}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={schedule.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(schedule.nextRunAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}