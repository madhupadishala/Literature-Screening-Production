# Cleanup Traceability Matrix

This document links requirements, architecture, implementation, tests and release evidence.

| Req | Area | Planned evidence | Status |
|---|---|---|---|
| URS-001..012 | Identity/Tenant/Workspace/RBAC | architecture tests + authorization negative tests | planned |
| URS-020..030 | Shared capabilities | adapter/interface tests + dependency-cruiser rules | planned |
| URS-040..049 | AI/Retrieval | retrieval auth tests + provenance/eval evidence | planned |
| URS-060..065 | Literature | existing literature verification + regression | planned |
| URS-070..075 | Intake | existing intake/Nexus verification + regression | planned |
| URS-080..085 | L2A | state/RBAC/evidence regression | planned |
| URS-090..095 | Submissions | submission workflow/idempotency evidence | planned |
| URS-100..104 | Audit/Evidence | immutability + attribution verification | planned |
| URS-110..117 | Security | Gitleaks + dependency audit + adversarial tests | planned |
| URS-120..126 | Code quality | tsc/eslint/Knip/jscpd/Madge/dependency-cruiser | planned |
| URS-130..134 | Benchmark | BEFORE/AFTER report | in progress |
| URS-140..145 | Clean export | provenance + archive hash + clean-repo CI | planned |

## Change record format

Every cleanup PR/change shall record:
- requirement(s)
- baseline finding
- architecture impact
- code change
- tests executed
- security evidence
- CodeRabbit disposition
- residual risk
- before/after benchmark impact
