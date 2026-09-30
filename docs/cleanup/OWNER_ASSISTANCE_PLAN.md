# Owner / Regulatory Assistance Plan — After Sprint 0–3 Qualification

Document ID: CLEANUP-OWNER-ACTIONS-001  
Status: Deferred until technically required  
Purpose: keep owner assistance concentrated at controlled decision points without interrupting source-code cleanup.

## No action required now

No owner action is required to continue technical qualification of Sprints 0–3.

## Assistance that will be required later

### 1. Regulatory interpretation approval
Required when:
- authoritative sources contain genuinely ambiguous implementation language;
- two jurisdictions conflict and a business/configuration policy is required;
- a controlled internal interpretation is proposed for production use.

Expected input:
- PV/regulatory SME review and approval/disposition.

### 2. Restricted/licensed source access
Required when:
- source redistribution is restricted;
- terminology/dictionaries require credentials or licences;
- client-controlled reference documents must enter the governed corpus.

Examples may include licensed terminology such as MedDRA/WHO Drug or client-controlled RSI/label/SOP material.

### 3. Production database migration approval
Required before:
- applying migration 033 or later governed migrations to production;
- retiring legacy identity/session/context paths;
- changing production authorization behavior.

Required evidence before owner approval:
- migration rehearsal;
- rollback/restore evidence;
- CI/security evidence;
- affected-module regression.

### 4. Supported jurisdiction scope
Required before claiming/configuring production support for jurisdictions beyond the approved source/test packs.

Decision must identify:
- jurisdiction;
- products/modules in scope;
- effective implementation date;
- required source pack;
- regulatory reviewer.

### 5. Supported commercial module combinations
Required only if the desired commercial offering changes the architecture's declared supported combinations.

The technical architecture already supports independently entitleable modules and versioned contracts. Owner input is needed only to define which combinations are officially offered/validated for clients.

### 6. Production regulatory-corpus approval
Cataloguing, parsing, chunking and embedding do not equal production approval.

Before a source becomes production-eligible, an authorized reviewer must approve:
- official origin;
- version/revision;
- effective date;
- jurisdiction/applicability;
- parsing/chunk quality;
- citation integrity;
- retrieval validation.

## Rule

Do not ask the owner for implementation choices that can be resolved safely from:
- the governing architecture;
- approved URS/FRS;
- authoritative regulator material;
- established engineering/security standards;
- existing characterized behavior.

Escalate only true business, regulatory-interpretation, credential/licensing or production-change decisions.
