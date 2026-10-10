"""Versioned, deterministic causality methods. Pure functions of verified inputs.
Each rule links to a source clause in the knowledge base (drift-checked at runtime).
Clinical validation of these packs by your safety physician is REQUIRED before use."""
import json
from dataclasses import dataclass, field
from pathlib import Path

from .schemas import Category, Factor


@dataclass(frozen=True)
class ClauseLink:
    kb: str
    source: str
    section_id: str
    version: str


@dataclass
class Inputs:
    temporal: str
    dechallenge: str
    rechallenge: str                 # positive | negative | not_done | unknown
    factors: dict                    # Factor -> yes|no|unknown (resolved; unverified => unknown)
    label_listed: str                # yes | unknown
    follow_up_exhausted: bool = False
    evidence: dict = field(default_factory=dict)


@dataclass
class Outcome:
    category: Category
    detail: str
    fired: list[str]
    missing: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


_WHO_SRC = "WHO-UMC causality categories"
_NAR_SRC = "Naranjo ADR probability scale"


def _alt(i): return i.factors[Factor.ALTERNATIVE_CAUSES]


class WhoUmc:
    method_id, version = "who_umc", "who-umc-1.2.0"
    links = {f"who_umc.{c}": ClauseLink("methodology", _WHO_SRC, c, "2013")
             for c in ("certain", "probable", "possible", "unlikely", "conditional", "unassessable")}

    def assess(self, i: Inputs) -> Outcome:
        """Conservative deterministic interpretation of WHO-UMC categories.

        The rule pack intentionally requires evidence combinations rather than treating any single signal
        (for example, dechallenge alone) as proof. Unknown evidence is never converted to a negative fact.
        """
        ev = i.evidence or {}
        latency_fit = ev.get("latency_fit", "unknown")
        temporal_p = ev.get("temporal_plausibility", "compatible" if i.temporal == "compatible" else "indeterminate")
        dechallenge_i = ev.get("dechallenge_interpretability", "interpretable" if i.dechallenge in ("positive", "negative") else "unknown")
        objective = ev.get("objective_evidence", i.factors.get(Factor.OBJECTIVE_CONFIRMATION, "unknown"))
        biologic = ev.get("biologic_plausibility", "unknown")
        class_effect = ev.get("class_effect", "unknown")
        completeness = ev.get("data_completeness", "partial")
        known = i.label_listed

        # Strong chronology contradictions can support Unlikely; delayed onset is not automatically implausible.
        if i.temporal == "implausible" or temporal_p == "implausible" or latency_fit in ("too_early", "too_late"):
            return Outcome(Category.UNLIKELY, "time relationship is clinically improbable",
                           ["who_umc.unlikely"], flags=["temporal_conflict"])

        missing = []
        if i.temporal == "unknown" or temporal_p == "indeterminate":
            missing.append("temporal_relationship")
        if _alt(i) == "unknown":
            missing.append("alternative_causes")

        # A negative rechallenge is strong contradictory evidence only when the timing itself is assessable.
        if i.rechallenge == "negative" and "temporal_relationship" not in missing:
            return Outcome(Category.UNLIKELY, "event did not recur on documented re-exposure",
                           ["who_umc.unlikely"], flags=["negative_rechallenge"])

        if missing:
            if i.follow_up_exhausted:
                return Outcome(Category.UNASSESSABLE, "critical causality information remains insufficient after follow-up",
                               ["who_umc.unassessable"], missing)
            return Outcome(Category.CONDITIONAL, "critical information is still required for classification",
                           ["who_umc.conditional"], missing)

        # A documented competing explanation prevents Certain/Probable under this conservative implementation.
        if _alt(i) == "yes":
            return Outcome(Category.POSSIBLE, "a reasonable alternative etiology or competing cause is present",
                           ["who_umc.possible"], flags=["alternative_cause_present"])

        # Certain: strong temporal relationship + no alternatives + highly specific evidence constellation.
        # Positive rechallenge is the clearest route. A second route is allowed only with objective/definitive
        # evidence and an interpretable positive dechallenge plus independent pharmacologic support.
        if i.rechallenge == "positive":
            return Outcome(Category.CERTAIN, "positive rechallenge with plausible timing and no identified alternative cause",
                           ["who_umc.certain"], flags=["certain_requires_medical_review"])

        strong_specificity = i.factors.get(Factor.DEFINITIVE_EVENT) == "yes"
        if (i.dechallenge == "positive" and dechallenge_i == "interpretable" and strong_specificity):
            return Outcome(Category.CERTAIN,
                           "definitive event with plausible interpretable dechallenge and no alternative cause",
                           ["who_umc.certain"], flags=["certain_requires_medical_review"])

        # Probable/Likely: reasonable temporal sequence, no alternative explanation, and clinically coherent
        # withdrawal response. Confounded improvement cannot satisfy this criterion.
        if i.dechallenge == "positive" and dechallenge_i == "interpretable":
            return Outcome(Category.PROBABLE,
                           "plausible temporal relationship and interpretable positive dechallenge with no alternative cause",
                           ["who_umc.probable"])

        flags = []
        if i.dechallenge == "positive" and dechallenge_i == "confounded":
            flags.append("dechallenge_confounded")
        if i.dechallenge == "negative":
            flags.append("negative_dechallenge")
        if completeness == "sparse":
            flags.append("sparse_evidence")
        return Outcome(Category.POSSIBLE,
                       "temporal relationship is plausible but withdrawal evidence is absent, unclear, not applicable, or confounded",
                       ["who_umc.possible"], flags=flags)


class Naranjo:
    method_id, version = "naranjo", "naranjo-1.0.0"
    links = {f"naranjo.{c}": ClauseLink("methodology", _NAR_SRC, c, "1981")
             for c in ("definite", "probable", "possible", "doubtful", "scoring")}

    def assess(self, i: Inputs) -> Outcome:
        f = i.factors
        score, missing = 0, []
        score += 1 if i.label_listed == "yes" else 0                              # Q1
        if i.temporal == "compatible":                                            # Q2
            score += 2
        elif i.temporal == "implausible":
            score -= 1
        else:
            missing.append("temporal_relationship")
        score += 1 if i.dechallenge == "positive" else 0                          # Q3
        score += {"positive": 2, "negative": -1}.get(i.rechallenge, 0)            # Q4
        score += {"yes": -1, "no": 2}.get(_alt(i), 0)                             # Q5
        if _alt(i) == "unknown":
            missing.append("alternative_causes")
        score += {"yes": -1, "no": 1}.get(f[Factor.PLACEBO_REACTION], 0)          # Q6
        score += 1 if f[Factor.TOXIC_LEVEL] == "yes" else 0                       # Q7
        score += 1 if f[Factor.DOSE_RESPONSE] == "yes" else 0                     # Q8
        score += 1 if f[Factor.PRIOR_SIMILAR_REACTION] == "yes" else 0            # Q9
        score += 1 if f[Factor.OBJECTIVE_CONFIRMATION] == "yes" else 0            # Q10
        if score >= 9:
            cat, rid, lab = Category.CERTAIN, "naranjo.definite", "definite"
        elif score >= 5:
            cat, rid, lab = Category.PROBABLE, "naranjo.probable", "probable"
        elif score >= 1:
            cat, rid, lab = Category.POSSIBLE, "naranjo.possible", "possible"
        else:
            cat, rid, lab = Category.UNLIKELY, "naranjo.doubtful", "doubtful"
        if missing and i.follow_up_exhausted:
            return Outcome(Category.UNASSESSABLE, f"score {score} with critical data missing",
                           ["naranjo.scoring"], missing)
        return Outcome(cat, f"Naranjo {lab} (score {score})", [rid, "naranjo.scoring"], missing,
                       flags=["missing_critical_data"] if missing else [])


REGISTRY = {WhoUmc.method_id: WhoUmc(), Naranjo.method_id: Naranjo()}


def load_policy_links(path: str | None = None) -> dict[str, ClauseLink]:
    """Regulatory clause links (e.g. GVP Module VI). Shipped UNMAPPED on purpose: a human must map
    real section IDs. Unmapped => fail closed (human review)."""
    p = Path(path or Path(__file__).parent / "data" / "policy_links.json")
    return {k: ClauseLink(**v) for k, v in json.loads(p.read_text()).items()}
