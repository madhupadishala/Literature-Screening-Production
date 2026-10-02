# Vercel Deployment Governance

Document ID: DEP-VERCEL-001  
Status: Mandatory deployment-control policy  
Applies to: cleanup/modernization work and Wave 4 onward

## 1. Objective

Prevent source-development activity from exhausting Vercel preview deployment quotas or build capacity. Vercel is a runtime-validation target, not a per-commit CI runner.

## 2. Working-branch rule

The controlled working branch `cleanup/zero-deviation-baseline-20260930` has automatic Vercel Git deployment disabled in `frontend/vercel.json`.

Normal source commits, documentation edits, CI fixes, CodeRabbit remediation and design-system work SHALL NOT create Vercel preview deployments from the working branch.

## 3. Intentional preview branch

Runtime previews use a dedicated checkpoint branch:

`preview/wave4`

A preview deployment is requested only by moving that branch to an exact qualified commit after the applicable source gates are green.

The checkpoint branch is not a development branch and shall not receive hand-edited commits.

## 4. Deployment admission criteria

A Vercel preview is permitted only when at least one condition is true:

1. browser/runtime verification is required for a material UI or workflow change;
2. a database migration or environment integration requires runtime rehearsal;
3. a blocking defect can only be reproduced or verified in Vercel;
4. an explicit user acceptance checkpoint has been reached;
5. a release-candidate checkpoint requires deployment evidence.

Documentation-only, test-only, comment-only, traceability-only, refactor-only and intermediate remediation commits do not qualify by themselves.

## 5. Rate-limit rule

The default policy is **one intentional preview deployment per qualified checkpoint**, not one deployment per commit.

Additional deployments inside the same checkpoint are permitted only when the previous deployment:
- failed before usable runtime validation;
- exposed a blocking runtime defect that requires a verified fix;
- or requires an explicitly approved migration/recovery retest.

Deployment attempts are batched. Source work continues locally/in GitHub while Vercel quota is unavailable.

## 6. Automation boundary

The governed automation is:

`work branch -> CI / CodeRabbit / design/security gates -> exact qualified SHA -> preview/wave4 ref -> Vercel preview -> runtime evidence`

The GitHub connector can move the preview branch to the exact qualified SHA. The Vercel connector is used to inspect deployment state, URLs and runtime logs.

Vercel project settings and secrets remain platform-controlled configuration. They are not inferred or silently changed when the connected Vercel interface does not expose that operation.

## 7. No production promotion

Preview deployment does not authorize production promotion. Production remains separately gated by migration evidence, release approval, security evidence, regulated validation and exact-head traceability.
