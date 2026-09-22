# Nexus Sprint 10 — Case Evidence, Export and Release Hardening

## Objective
Package the governed source-to-final-case history and provide controlled release outputs without claiming capabilities not yet implemented.

## Case Evidence Package
A finalized case can generate a versioned, SHA-256 protected Case Evidence Package containing:
- original source metadata and source hash;
- source-document metadata and hashes;
- extraction runs and human suggestion decisions;
- ICSR validity/triage assessment history;
- duplicate/follow-up search and human decision history;
- Intake dispositions;
- all case draft revisions;
- product-event assessments;
- narrative versions;
- assist suggestions and their human review;
- QC / Medical Review actions;
- review queries;
- finalization checks;
- workflow tasks;
- follow-up links;
- case audit events;
- immutable final case version.

Uploaded source-document bytes are not embedded in the JSON package.

Evidence packages and generated exports are append-only artifacts.

## Export formats
Sprint 10 supports:
- `NEXUS_CASE_JSON`
- `E2B_R3_MAPPING_JSON`
- `HUMAN_READABLE_HTML`

Every export receives a content SHA-256 and is tenant/module/RBAC protected.

## E2B(R3) boundary
The E2B(R3) output is an internal structured mapping representation based on the Nexus E2B(R3)-aware case model.

It is explicitly **not**:
- ICH/region-specific validated XML transmission;
- an EVWEB / gateway connection;
- an Argus/Veeva submission connector;
- an acknowledgement (ACK) workflow.

Those require later integration/validation work.

## Eight golden cases
The Sprint 10 gate covers:
1. valid spontaneous non-serious initial case;
2. serious spontaneous case with seriousness criterion;
3. incomplete report / missing reporter blocked;
4. confirmed duplicate cannot create a new case;
5. follow-up routes to existing case rather than new case;
6. literature-origin case through the same case-finalization model;
7. multi-product / multi-event case requiring assessment coverage for every relevant pair;
8. QC return/open query blocks finalization, then correction + QC/MR approvals allow finalization.

## Security/release assertions
The release gate verifies:
- CASE_PROCESSING module gating;
- route-level RBAC;
- direct API protection;
- immutable regulated histories;
- no raw source bytes in evidence JSON;
- no direct third-party safety-database network transmission;
- no proprietary MedDRA/WHODrug content in the zero-cost baseline.

## Release-candidate boundary
Completing Sprint 10 means the planned functional Nexus build has reached a release-candidate state.

It does **not** by itself mean formally validated regulated production.

Production hand-off still requires the controlled validation/release program, including applicable requirements traceability, risk assessment, UAT/validation protocols and evidence, security/negative/performance testing, backup/restore qualification, deployment qualification, operational procedures and controlled release approval.
