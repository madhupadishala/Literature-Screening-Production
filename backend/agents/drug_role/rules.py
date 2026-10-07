import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from .schemas import DrugRole, EvidenceSpan


@dataclass(frozen=True)
class RoleSignal:
    role: DrugRole
    pattern: re.Pattern
    evidence_type: str
    weight: float


def _rx(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


ROLE_SIGNALS: Tuple[RoleSignal, ...] = (
    RoleSignal(DrugRole.SUSPECT, _rx(r"\b(suspect(?:ed)?|possibly related|probably related|related to|attributed to|caused by|due to)\b"), "explicit_suspect", 5.0),
    RoleSignal(DrugRole.SUSPECT, _rx(r"\b(discontinued|withdrawn|stopped|held)\b.{0,80}\b(event|reaction|rash|toxicity|adverse)\b"), "dechallenge_action", 2.5),
    RoleSignal(DrugRole.SUSPECT, _rx(r"\b(rechallenge|re[- ]?introduced|restarted)\b"), "rechallenge", 2.0),
    RoleSignal(DrugRole.CONCOMITANT, _rx(r"\b(concomitant|concomitantly|background therapy|continued unchanged|chronic medication|maintenance therapy)\b"), "explicit_concomitant", 4.5),
    RoleSignal(DrugRole.HISTORICAL, _rx(r"\b(history of|previously received|previously treated|past medication|prior therapy|had taken)\b"), "historical_use", 4.5),
    RoleSignal(DrugRole.TREATMENT, _rx(r"\b(treated with|administered for|given for|for treatment of|managed with|rescue medication)\b"), "event_treatment", 4.5),
)


NEGATING_PATTERNS = (
    _rx(r"\bnot suspected\b"),
    _rx(r"\bunrelated\b"),
    _rx(r"\bnot related\b"),
    _rx(r"\bno causal relationship\b"),
)


def sentence_windows(text: str) -> List[Tuple[int, int, str]]:
    windows: List[Tuple[int, int, str]] = []
    start = 0
    for match in re.finditer(r"(?<=[.!?])\s+", text):
        end = match.start()
        if end > start:
            windows.append((start, end, text[start:end]))
        start = match.end()
    if start < len(text):
        windows.append((start, len(text), text[start:]))
    return windows


def classify_context(context: str, global_start: int = 0) -> Tuple[DrugRole, float, str, List[EvidenceSpan]]:
    scores: Dict[DrugRole, float] = {role: 0.0 for role in DrugRole}
    evidence: List[EvidenceSpan] = []

    for signal in ROLE_SIGNALS:
        for match in signal.pattern.finditer(context):
            scores[signal.role] += signal.weight
            evidence.append(
                EvidenceSpan(
                    text=match.group(0),
                    start=global_start + match.start(),
                    end=global_start + match.end(),
                    evidence_type=signal.evidence_type,
                    weight=signal.weight,
                )
            )

    negated = any(p.search(context) for p in NEGATING_PATTERNS)
    if negated:
        scores[DrugRole.SUSPECT] = max(0.0, scores[DrugRole.SUSPECT] - 6.0)
        evidence.append(
            EvidenceSpan(
                text="negative causality/suspect wording detected",
                start=global_start,
                end=global_start + len(context),
                evidence_type="suspect_negation",
                weight=-6.0,
            )
        )

    # Treatment evidence must not be allowed to accidentally promote a drug to suspect.
    if scores[DrugRole.TREATMENT] >= 4.5 and scores[DrugRole.SUSPECT] < 5.0:
        role = DrugRole.TREATMENT
    else:
        role = max(scores, key=scores.get)

    top_score = scores[role]
    sorted_scores = sorted(scores.values(), reverse=True)
    second = sorted_scores[1] if len(sorted_scores) > 1 else 0.0

    if top_score <= 0.0:
        return DrugRole.UNKNOWN, 0.45, "No reliable role-defining evidence found.", evidence

    margin = top_score - second
    confidence = min(0.99, 0.60 + (top_score / 12.0) + (margin / 20.0))
    rationale = f"{role.value} selected from explicit/contextual PV evidence (score={top_score:.1f}, margin={margin:.1f})."
    return role, confidence, rationale, evidence


def merge_role_decisions(decisions: Iterable[Tuple[DrugRole, float, str, List[EvidenceSpan]]]):
    decisions = list(decisions)
    if not decisions:
        return DrugRole.UNKNOWN, 0.45, "No evidence windows available.", []

    ranked = sorted(decisions, key=lambda d: d[1], reverse=True)
    best = ranked[0]
    roles = {d[0] for d in decisions if d[1] >= 0.80}
    if len(roles) > 1:
        return DrugRole.UNKNOWN, 0.55, "Conflicting high-confidence role evidence requires human review.", [e for d in decisions for e in d[3]]
    return best
