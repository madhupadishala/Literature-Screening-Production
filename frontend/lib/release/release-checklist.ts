import type { ReleaseChecklistDefinition } from "./types";

export const RELEASE_CHECKLIST: ReleaseChecklistDefinition[] = [
  {
    id: "build-passed",
    title: "Production build passed",
    description:
      "npm run build completed with TypeScript, route generation, and production bundling successful.",
    mandatory: true,
    ownerRole: "Engineering",
  },
  {
    id: "migrations-verified",
    title: "Database migrations verified",
    description: "Required migrations 001-013 are applied and database readiness reports no drift.",
    mandatory: true,
    ownerRole: "Engineering / Database Operations",
  },
  {
    id: "e2e-validation",
    title: "Authoritative end-to-end validation passed",
    description:
      "The production validator completed with database dataset verification and deployed HTTP probes enabled.",
    mandatory: true,
    ownerRole: "Engineering / QA",
  },
  {
    id: "security-review",
    title: "Security and tenant-isolation review completed",
    description:
      "Secrets, trusted identity, RBAC, audit, response headers, logs, and cross-tenant isolation were reviewed.",
    mandatory: true,
    ownerRole: "Security / Engineering",
  },
  {
    id: "backup-rollback",
    title: "Backup and rollback path verified",
    description:
      "A database backup, previous deployable build, restoration owner, and rollback commands are available.",
    mandatory: true,
    ownerRole: "Release Manager",
  },
  {
    id: "release-notes",
    title: "Release notes approved",
    description:
      "Scope, known limitations, architecture boundaries, migrations, and operational changes are documented.",
    mandatory: true,
    ownerRole: "Product Owner",
  },
  {
    id: "uat-signoff",
    title: "PV and QA UAT sign-off completed",
    description:
      "Mandatory automated and manual Literature Screening scenarios passed with governed evidence.",
    mandatory: true,
    ownerRole: "PV Product / QA",
  },
  {
    id: "monitoring-verified",
    title: "Monitoring and performance budgets verified",
    description:
      "Liveness, readiness, dependency health, incidents, audit, metrics, and performance budgets were reviewed.",
    mandatory: true,
    ownerRole: "Engineering / Operations",
  },
  {
    id: "release-owner-approval",
    title: "Release owner approval",
    description:
      "The designated release owner authorizes creation of the immutable release candidate.",
    mandatory: true,
    ownerRole: "Release Owner",
  },
];
