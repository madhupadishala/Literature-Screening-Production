"""Independent deterministic channel. Errs toward flagging: ambiguity => hit."""
import re
from dataclasses import dataclass

from .schemas import Criterion as C

_RAW = {
    C.DEATH: r"died|dies|death|deceased|expired|fatal\w*|passed away|demise|killed|succumbed|autopsy|\bdead\b",
    C.LIFE_THREATENING: r"life[- ]threatening|cardiac arrest|respiratory arrest|resuscitat\w*|intubat\w*|"
                        r"mechanical(?:ly)? ventilat\w*|anaphyla\w*|status epilepticus|septic shock|"
                        r"at risk of death|defibrillat\w*",
    C.HOSPITALIZATION: r"hospitali[sz]\w*|admitted|admission|inpatient|intensive care|\bICU\b",
    C.DISABILITY: r"disab\w*|incapacit\w*|paraly\w*|paraplegi\w*|quadriplegi\w*|permanent(?:ly)? "
                  r"(?:impair\w*|damage\w*)|blindness|unable to (?:work|walk)|persistent or significant",
    C.CONGENITAL_ANOMALY: r"congenital|birth defect|malformation|anomal\w*|born with|teratogen\w*|"
                          r"fetal abnormal\w*",
    C.MEDICALLY_IMPORTANT: r"medically (?:important|significant)|important medical event|convuls\w*|"
                           r"seizure\w*|bronchospasm|angioedema|agranulocytosis|aplastic an\w*mia|"
                           r"dyscrasia|stevens[- ]johnson|toxic epidermal necrolysis|torsade\w*|"
                           r"(?:hepatic|liver|renal|kidney) failure|drug dependence|overdose|"
                           r"spontaneous abortion|miscarriage|stillb\w*|suicid\w*|malignan\w*|cancer",
}
PATTERNS = {c: re.compile(p, re.I) for c, p in _RAW.items()}

_NEG = {"no", "not", "never", "denies", "denied", "without", "negative", "absence", "nor",
        "neither", "ruled", "free"}
_BREAK = {"and", "but", "or", "then", "however", "although", "though", "while", "who", "which",
          "after", "because", "later"}
_POST_NEG = re.compile(
    r"^\W*(?:\w+\s+){0,2}?(?:not|never)\s+(?:required|needed|necessary|indicated|reported|observed)", re.I)


@dataclass(frozen=True)
class Hit:
    criterion: C
    text: str
    negated: bool


def _negated(text: str, start: int, end: int) -> bool:
    clause_start = max((text.rfind(ch, 0, start) for ch in ".;:,\n"), default=-1) + 1
    tokens = re.findall(r"[\w'-]+", text[clause_start:start].lower())
    for tok in reversed(tokens[-4:]):
        if tok in _BREAK:
            break
        if tok in _NEG:
            return True
    return bool(_POST_NEG.match(text[end:end + 60]))


def scan(narrative: str) -> list[Hit]:
    hits = []
    for crit, pat in PATTERNS.items():
        for m in pat.finditer(narrative):
            hits.append(Hit(crit, m.group(0), _negated(narrative, m.start(), m.end())))
    return hits
