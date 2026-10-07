# Nexus Seriousness Agent integration status

Branch: `feature/seriousness-agent-v090`

## Production candidate
- Primary extraction: OpenAI `gpt-6.1-sol`, reasoning effort `medium`.
- High-risk fallback: OpenAI `gpt-6-astra`.
- Final seriousness remains deterministic ICH E2A rule output.
- Any model failure, disagreement, insufficient evidence, or security concern routes to HITL.

## Safety gate
`NEXUS_SERIOUSNESS_ENABLED=false` remains the default until formal blinded full-ICSR PQ is completed and approved.

## Shared service contract
Nexus modules call `POST /v1/agents/seriousness/assess` through a server-side client. Literature, Intake, and Case Processing consume the same typed decision contract.

## Validation rule
No validation-case gold labels, FDA seriousness fields, adjudicated outcomes, or case-specific expected answers may enter prompts, RAG, examples, fine-tuning data, or the service request.
