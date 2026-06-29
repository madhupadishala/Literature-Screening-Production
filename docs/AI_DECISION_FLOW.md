# AI Decision Flow

ClinixAI does not use LLM output alone as the final decision.

## Decision Flow

Input article
→ Normalize article
→ Retrieve relevant knowledge
→ Apply deterministic rules
→ Build AI prompt
→ LLM analysis
→ Validate response
→ Assign confidence
→ Generate decision rationale
→ Write audit trail

## Decision Output

Every AI decision must return:

- Decision
- Confidence
- Rationale
- Evidence
- Rules used
- Knowledge sources used
- Manual review flag
