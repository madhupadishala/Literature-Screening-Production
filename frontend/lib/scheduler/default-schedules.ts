import type { CreateScheduleInput } from "./scheduler-types";

export function createDefaultLiteratureSchedules(
  tenantId: string,
): CreateScheduleInput[] {
  const firstRun = new Date();
  firstRun.setMinutes(firstRun.getMinutes() + 5);

  return [
    {
      tenantId,
      name: "Daily Literature Article Fetch",
      description: "Fetches scheduled literature articles for the tenant.",
      jobType: "article_fetch",
      priority: "high",
      frequency: "daily",
      payload: {
        source: "literature_calendar",
      },
      nextRunAt: firstRun.toISOString(),
    },
    {
      tenantId,
      name: "Daily Evidence Package Export",
      description: "Prepares completed evidence packages for export review.",
      jobType: "export",
      priority: "normal",
      frequency: "daily",
      payload: {
        exportType: "evidence_package",
      },
      nextRunAt: firstRun.toISOString(),
    },
  ];
}