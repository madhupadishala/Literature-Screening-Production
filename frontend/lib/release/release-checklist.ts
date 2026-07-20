import type { ReleaseChecklistDefinition } from "./types";

export const RELEASE_CHECKLIST: ReleaseChecklistDefinition[] = [
  {
    id: "build-passed",
    title: "Production build passed",
    description: "npm run build completed with TypeScript and route generation successful.",
    mandatory: true,
    ownerRole: "Engineering",
  },
  {
    id: "nft-warning-reviewed",
    title: "NFT trace warning resolved or accepted",
    description:
      "The next.config.ts trace warning is removed, or its risk is formally reviewed and accepted for this candidate.",
    mandatory: true,
    ownerRole: "Engineering",
  },
  {
    id: "security-review",
    title: "Security review completed",
    description: "Secrets, access control, headers, logs and tenant isolation were reviewed.",
    mandatory: true,
    ownerRole: "Security / Engineering",
  },
  {
    id: "backup-rollback",
    title: "Rollback path verified",
    description: "Previous deployable build and restoration instructions are available.",
    mandatory: true,
    ownerRole: "Release Manager",
  },
  {
    id: "release-notes",
    title: "Release notes approved",
    description: "Scope, known limitations, architecture boundaries and operational changes are documented.",
    mandatory: true,
    ownerRole: "Product Owner",
  },
  {
    id: "uat-signoff",
    title: "UAT sign-off completed",
    description: "Mandatory automated and manual Literature Screening scenarios have passed.",
    mandatory: true,
    ownerRole: "PV Product / QA",
  },
  {
    id: "monitoring-verified",
    title: "Monitoring verified",
    description: "Health, readiness, monitoring and security event endpoints were reviewed.",
    mandatory: true,
    ownerRole: "Engineering",
  },
  {
    id: "release-owner-approval",
    title: "Release owner approval",
    description: "The designated release owner authorizes creation of the release candidate.",
    mandatory: true,
    ownerRole: "Release Owner",
  },
];
