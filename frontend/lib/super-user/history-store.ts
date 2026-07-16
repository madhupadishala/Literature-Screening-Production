export type PackageLifecycleStage =
  | "HITS"
  | "SCREENING"
  | "LOCKED"
  | "INTAKE"
  | "QC"
  | "COMPLETED"
  | "UNLOCKED"
  | "ROUTED_BACK";

export type AuditAction =
  | "PACKAGE_CREATED"
  | "HITS_GENERATED"
  | "SCREENING_STARTED"
  | "PACKAGE_LOCKED"
  | "COMMENT_ADDED"
  | "PACKAGE_UNLOCKED"
  | "OVERRIDE_APPLIED"
  | "ROUTED_BACK"
  | "INTAKE_STARTED"
  | "QC_STARTED"
  | "PACKAGE_COMPLETED"
  | "VERSION_CREATED";

export type CommentType = "LOCK" | "UNLOCK" | "OVERRIDE" | "ROUTE_BACK" | "GENERAL";

export type PackageComment = {
  id: string;
  packageId: string;
  type: CommentType;
  comment: string;
  createdBy: string;
  createdAt: string;
};

export type UnlockRecord = {
  id: string;
  packageId: string;
  unlockedBy: string;
  unlockedAt: string;
  reason: string;
  previousStatus: string;
  newStatus: string;
};

export type WorkflowTransition = {
  id: string;
  packageId: string;
  fromStage: PackageLifecycleStage;
  toStage: PackageLifecycleStage;
  performedBy: string;
  performedAt: string;
  reason?: string;
};

export type AuditEntry = {
  id: string;
  packageId: string;
  action: AuditAction;
  title: string;
  description: string;
  actor: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
};

export type VersionHistory = {
  id: string;
  packageId: string;
  version: string;
  createdBy: string;
  createdAt: string;
  summary: string;
};

export type PackageHistory = {
  packageId: string;
  packageName: string;
  currentStage: PackageLifecycleStage;
  currentStatus: string;
  createdAt: string;
  createdBy: string;
  comments: PackageComment[];
  unlockRecords: UnlockRecord[];
  workflowTransitions: WorkflowTransition[];
  auditEntries: AuditEntry[];
  versionHistory: VersionHistory[];
};

const packageHistories: PackageHistory[] = [
  {
    packageId: "PKG-LIT-2026-0001",
    packageName: "Paracetamol Weekly Literature Package",
    currentStage: "COMPLETED",
    currentStatus: "Completed",
    createdAt: "2026-07-05T08:30:00+05:30",
    createdBy: "Super User",
    comments: [
      {
        id: "CMT-0001",
        packageId: "PKG-LIT-2026-0001",
        type: "LOCK",
        comment: "Package locked after screening review completion.",
        createdBy: "Screening Lead",
        createdAt: "2026-07-05T10:10:00+05:30",
      },
      {
        id: "CMT-0002",
        packageId: "PKG-LIT-2026-0001",
        type: "UNLOCK",
        comment: "Unlocked to correct seriousness classification before QC.",
        createdBy: "Super User",
        createdAt: "2026-07-05T11:00:00+05:30",
      },
      {
        id: "CMT-0003",
        packageId: "PKG-LIT-2026-0001",
        type: "OVERRIDE",
        comment: "Override applied for expedited classification due to hospitalization.",
        createdBy: "QC Reviewer",
        createdAt: "2026-07-05T12:20:00+05:30",
      },
    ],
    unlockRecords: [
      {
        id: "UNL-0001",
        packageId: "PKG-LIT-2026-0001",
        unlockedBy: "Super User",
        unlockedAt: "2026-07-05T11:00:00+05:30",
        reason: "Correction required before QC finalization.",
        previousStatus: "Locked",
        newStatus: "Unlocked for correction",
      },
    ],
    workflowTransitions: [
      {
        id: "TRN-0001",
        packageId: "PKG-LIT-2026-0001",
        fromStage: "HITS",
        toStage: "SCREENING",
        performedBy: "Workflow Manager",
        performedAt: "2026-07-05T09:00:00+05:30",
        reason: "Hits generated successfully.",
      },
      {
        id: "TRN-0002",
        packageId: "PKG-LIT-2026-0001",
        fromStage: "SCREENING",
        toStage: "LOCKED",
        performedBy: "Screening Lead",
        performedAt: "2026-07-05T10:10:00+05:30",
        reason: "Screening completed.",
      },
      {
        id: "TRN-0003",
        packageId: "PKG-LIT-2026-0001",
        fromStage: "LOCKED",
        toStage: "UNLOCKED",
        performedBy: "Super User",
        performedAt: "2026-07-05T11:00:00+05:30",
        reason: "Correction requested.",
      },
      {
        id: "TRN-0004",
        packageId: "PKG-LIT-2026-0001",
        fromStage: "UNLOCKED",
        toStage: "QC",
        performedBy: "QC Reviewer",
        performedAt: "2026-07-05T12:00:00+05:30",
        reason: "Correction completed and routed to QC.",
      },
      {
        id: "TRN-0005",
        packageId: "PKG-LIT-2026-0001",
        fromStage: "QC",
        toStage: "COMPLETED",
        performedBy: "QC Reviewer",
        performedAt: "2026-07-05T13:30:00+05:30",
        reason: "QC completed.",
      },
    ],
    auditEntries: [
      {
        id: "AUD-0001",
        packageId: "PKG-LIT-2026-0001",
        action: "PACKAGE_CREATED",
        title: "Package Created",
        description: "Literature package was created for weekly review.",
        actor: "Super User",
        timestamp: "2026-07-05T08:30:00+05:30",
      },
      {
        id: "AUD-0002",
        packageId: "PKG-LIT-2026-0001",
        action: "HITS_GENERATED",
        title: "Hits Generated",
        description: "Initial literature hits were generated and queued.",
        actor: "Workflow Manager",
        timestamp: "2026-07-05T08:50:00+05:30",
        metadata: {
          hitsCount: 42,
          source: "PubMed",
        },
      },
      {
        id: "AUD-0003",
        packageId: "PKG-LIT-2026-0001",
        action: "SCREENING_STARTED",
        title: "Screening Started",
        description: "Screening team started package review.",
        actor: "Screening User",
        timestamp: "2026-07-05T09:00:00+05:30",
      },
      {
        id: "AUD-0004",
        packageId: "PKG-LIT-2026-0001",
        action: "PACKAGE_LOCKED",
        title: "Package Locked",
        description: "Package was locked after screening completion.",
        actor: "Screening Lead",
        timestamp: "2026-07-05T10:10:00+05:30",
      },
      {
        id: "AUD-0005",
        packageId: "PKG-LIT-2026-0001",
        action: "PACKAGE_UNLOCKED",
        title: "Package Unlocked",
        description: "Package was unlocked for correction.",
        actor: "Super User",
        timestamp: "2026-07-05T11:00:00+05:30",
      },
      {
        id: "AUD-0006",
        packageId: "PKG-LIT-2026-0001",
        action: "OVERRIDE_APPLIED",
        title: "Override Applied",
        description: "Expedited seriousness override was applied.",
        actor: "QC Reviewer",
        timestamp: "2026-07-05T12:20:00+05:30",
      },
      {
        id: "AUD-0007",
        packageId: "PKG-LIT-2026-0001",
        action: "PACKAGE_COMPLETED",
        title: "Package Completed",
        description: "Package completed final QC review.",
        actor: "QC Reviewer",
        timestamp: "2026-07-05T13:30:00+05:30",
      },
    ],
    versionHistory: [
      {
        id: "VER-0001",
        packageId: "PKG-LIT-2026-0001",
        version: "v1.0",
        createdBy: "Workflow Manager",
        createdAt: "2026-07-05T08:30:00+05:30",
        summary: "Initial package created.",
      },
      {
        id: "VER-0002",
        packageId: "PKG-LIT-2026-0001",
        version: "v1.1",
        createdBy: "Super User",
        createdAt: "2026-07-05T11:05:00+05:30",
        summary: "Unlocked correction version created.",
      },
      {
        id: "VER-0003",
        packageId: "PKG-LIT-2026-0001",
        version: "v1.2",
        createdBy: "QC Reviewer",
        createdAt: "2026-07-05T12:25:00+05:30",
        summary: "Override and QC correction version created.",
      },
    ],
  },
];

export function getPackageHistory(packageId?: string): PackageHistory {
  if (!packageId) {
    return packageHistories[0];
  }

  const history = packageHistories.find((item) => item.packageId === packageId);

  return history ?? packageHistories[0];
}

export function getPackageComments(packageId?: string): PackageComment[] {
  return getPackageHistory(packageId).comments;
}

export function createPackageComment(input: {
  packageId: string;
  type: CommentType;
  comment: string;
  createdBy: string;
}): PackageComment {
  const history = getPackageHistory(input.packageId);

  const newComment: PackageComment = {
    id: `CMT-${String(history.comments.length + 1).padStart(4, "0")}`,
    packageId: input.packageId,
    type: input.type,
    comment: input.comment,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };

  history.comments.unshift(newComment);

  history.auditEntries.unshift({
    id: `AUD-${String(history.auditEntries.length + 1).padStart(4, "0")}`,
    packageId: input.packageId,
    action: "COMMENT_ADDED",
    title: `${input.type} Comment Added`,
    description: input.comment,
    actor: input.createdBy,
    timestamp: newComment.createdAt,
  });

  return newComment;
}