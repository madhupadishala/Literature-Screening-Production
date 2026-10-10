"""AE-006: outcome mappings only from explicitly reported event outcome text."""
import re

def outcome_from_quote(quote: str | None) -> str:
    if not quote:
        return "unknown"
    text=quote.casefold()
    # Avoid mistaking negated improvement for a positive outcome.
    if re.search(r"\b(no improvement|not improved|unchanged|persist(?:ed|s|ing)?|did not resolve|not resolved)\b",text):
        return "not_recovered_not_resolved"
    if re.search(r"\b(recovering|resolving|improv(?:ed|ing)|getting better)\b",text):
        return "recovering_resolving"
    if re.search(r"\b(recovered|resolved|fully disappeared|completely disappeared)\b",text):
        return "recovered_resolved"
    return "unknown"
