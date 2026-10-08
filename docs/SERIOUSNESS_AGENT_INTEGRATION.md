# Nexus Seriousness Agent integration status

Branch: `feature/seriousness-agent-v090`

## Production candidate
- Primary/fallback model IDs must be explicitly configured and verified against the approved provider account.
- ChatGPT internal model labels are not asserted to be public API IDs. Provider configuration and live qualification are pending.
- Final seriousness remains deterministic ICH E2A rule output.
- Any model failure, disagreement, insufficient evidence, or security concern routes to HITL.

## Safety gate
`NEXUS_SERIOUSNESS_ENABLED=false` remains the default until formal blinded full-ICSR PQ is completed and approved.

## Shared service contract
Nexus modules call `POST /v1/agents/seriousness/assess` through a server-side client. Literature, Intake, and Case Processing consume the same typed decision contract.

## Validation rule
No validation-case gold labels, FDA seriousness fields, adjudicated outcomes, or case-specific expected answers may enter prompts, RAG, examples, fine-tuning data, or the service request.


## Hardened boundary
Tenant/client/request/case echoes and schema validation are mandatory. `input_sha256` must match the exact UTF-8 narrative bytes; the client sends that digest in `x-input-sha256`. The external v0.9 service must align with this v2 boundary before enabling the flag. Unknown/contradictory/malformed responses fail closed. API caller: `/api/safety/cases/[caseId]/agents/seriousness`; it authorizes the selected workspace and case before reading source input.
