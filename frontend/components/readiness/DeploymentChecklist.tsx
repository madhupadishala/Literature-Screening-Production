"use client";

interface ChecklistItem {
  title: string;
  completed: boolean;
}

const checklist: ChecklistItem[] = [
  {
    title: "Authentication configured",
    completed: true,
  },
  {
    title: "RBAC configured",
    completed: true,
  },
  {
    title: "Tenant configuration",
    completed: true,
  },
  {
    title: "Workflow engine",
    completed: true,
  },
  {
    title: "AI Intelligence Layer",
    completed: true,
  },
  {
    title: "Monitoring",
    completed: true,
  },
  {
    title: "Analytics",
    completed: true,
  },
  {
    title: "Notifications",
    completed: true,
  },
  {
    title: "Enterprise Search",
    completed: true,
  },
  {
    title: "Import / Export",
    completed: true,
  },
];

export default function DeploymentChecklist() {
  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-6 text-2xl font-semibold">
        Deployment Checklist
      </h2>

      <div className="space-y-3">

        {checklist.map((item) => (
          <div
            key={item.title}
            className="flex items-center justify-between rounded-lg border p-4"
          >
            <span>{item.title}</span>

            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
              {item.completed ? "✓ Ready" : "Pending"}
            </span>
          </div>
        ))}

      </div>

    </div>
  );
}