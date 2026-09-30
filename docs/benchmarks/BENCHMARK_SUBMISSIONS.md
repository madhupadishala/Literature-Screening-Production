# Submissions Benchmark — Cleanup Sprint 7

Document ID: BENCH-SUB-001  
Benchmark date: 2026-09-30  
Status: Controlled public-source benchmark

## Objective

Define production-grade ICSR submission lifecycle expectations using current public pharmacovigilance references while separating package/readiness capability from actual regulator gateway connectivity.

## Oracle Argus / Safety One

Oracle's current 2026.1.01 documentation identifies E2B report configuration, validation, transmitting, monitoring and import as Interchange capabilities. Current documentation also describes acknowledgment handling and submission-status monitoring.

Sources:
- Oracle, **Safety One Argus 2026.1.01 — Books**, accessed 2026-09-30. The Argus Interchange guides cover configuration, validation, viewing, transmitting, monitoring and import of E2B reports. https://docs.oracle.com/en/industries/life-sciences/safety-one-argus/2026.1.01/books.html
- Oracle, **Argus Interchange — E2B Initial or Follow-up Intake**, release 2026.1.01; accessed 2026-09-30. It documents business/low-level acknowledgment behavior and report exchange. https://docs.oracle.com/en/industries/life-sciences/argus-safety/2026.1.01/aeoba/e2b-initial-or-follow-intake.html
- Oracle, **Argus Interchange — Interchange Accept Process**, release 2026.1.01; accessed 2026-09-30. It describes E2B(R3) hard/soft validation and ACK generation. https://docs.oracle.com/en/industries/life-sciences/argus-safety/2026.1.01/aeoba/interchange-accept-process.html

## ArisGlobal MultiVigilance

ArisGlobal describes current MultiVigilance as an end-to-end safety platform with automation from intake to submission, global/regional compliance support, and open integrations. Its public FDA E2B(R3) material highlights region-specific validation and submission requirements.

Sources:
- ArisGlobal, **MultiVigilance**, current public product page; accessed 2026-09-30. https://www.arisglobal.com/lifesphere/safety/multivigilance-system/
- ArisGlobal, **Navigate the FDA's E2B(R3) Mandate with Confidence**, published 2025-07-30; accessed 2026-09-30. https://www.arisglobal.com/blogs/navigate-the-fdas-e2br3-mandate-with-confidence-powered-by-lifesphere-multivigilance/

## Veeva operational signal

Veeva public release material for its E2B Link reports operational tracking fields including send file, ACK file, MDN date, ACK date and ACK error/details. This is used only as a message-traceability benchmark.

Source:
- Veeva, **What's New in 25R1**, public release notes; accessed 2026-09-30. https://cdmshelp.veeva.com/ko/lr/rn/general-releases/25r1/whats-new/

## Sprint 7 benchmark target

The Submissions foundation shall provide:
1. finalized authoritative case version as the only submission source;
2. workspace/environment ownership;
3. destination/profile-specific immutable package payload and hashes;
4. idempotent package creation;
5. separate transport adapter interface;
6. durable attempt history;
7. safe retry without duplicate package creation;
8. fail-closed behavior when no transport is configured;
9. external message identifier capture;
10. acknowledgment history and acknowledgment-aware state;
11. audit attribution;
12. no false claim of regulator connectivity without credentialed, validated adapter evidence.

## Non-claim

Sprint 7 creates the canonical application foundation. It is not proof of connectivity to FDA, EMA/EudraVigilance, MHRA, PMDA, Health Canada, TGA or any partner gateway. Each real transport requires separate credentials, conformance testing, security review, validation and production approval.
