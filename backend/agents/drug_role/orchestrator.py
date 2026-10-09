import re
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .ownership import resolve_ownership
from .rules import classify_context, merge_role_decisions, sentence_windows
from .schemas import DrugClassification, DrugMention, DrugRole, DrugRoleResult, Ownership


COMMON_GENERIC_NAMES = ("aspirin", "paracetamol", "acetaminophen", "metformin", "ibuprofen", "warfarin", "insulin", "cetirizine", "prednisolone", "carbamazepine")

DEFAULT_DRUG_PATTERNS = (
    # Common medicinal product suffixes; intentionally conservative.
    r"\b[A-Z][a-zA-Z0-9-]{2,}(?:mab|nib|vir|cillin|cycline|pril|sartan|olol|azole|statin|caine|mycin|zepam|oxetine|formin|prazole)\b",
)


class DrugRoleOrchestrator:
    """
    Evidence-first drug-role agent.

    This v1 deliberately separates:
      1) clinical role: SUSPECT / CONCOMITANT / HISTORICAL / TREATMENT / UNKNOWN
      2) ownership: COMPANY / NON_COMPANY / UNKNOWN

    It can accept upstream NER/WHO Drug candidates. Regex discovery is only a fallback.
    """

    def __init__(self, mention_patterns: Optional[Sequence[str]] = None):
        self.mention_patterns = tuple(mention_patterns or DEFAULT_DRUG_PATTERNS)

    @staticmethod
    def normalize_name(name: str, normalization_map: Optional[Dict[str, str]] = None) -> str:
        cleaned = re.sub(r"\s+", " ", name).strip(" ,.;:()[]")
        if normalization_map:
            return normalization_map.get(cleaned.lower(), cleaned)
        return cleaned

    def extract_mentions(
        self,
        text: str,
        candidate_drugs: Optional[Iterable[str]] = None,
        normalization_map: Optional[Dict[str, str]] = None,
    ) -> List[DrugMention]:
        candidates = set()
        if candidate_drugs:
            candidates.update(x.strip() for x in candidate_drugs if x and x.strip())

        candidates.update(name for name in COMMON_GENERIC_NAMES if re.search(rf"\b{re.escape(name)}\b", text, re.IGNORECASE))

        for pattern in self.mention_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                candidates.add(match.group(0))

        mentions: List[DrugMention] = []
        windows = sentence_windows(text)
        claimed = []

        for drug in sorted(candidates, key=lambda x: (-len(x), x.lower())):
            rx = re.compile(rf"(?<!\w){re.escape(drug)}(?!\w)", re.IGNORECASE)
            for match in rx.finditer(text):
                if any(match.start() < end and start < match.end() for start, end in claimed):
                    continue
                claimed.append((match.start(), match.end()))
                sentence_start, sentence_end, sentence = 0, len(text), text
                for ws, we, content in windows:
                    if ws <= match.start() < we:
                        sentence_start, sentence_end, sentence = ws, we, content
                        break
                mentions.append(
                    DrugMention(
                        reported_name=match.group(0),
                        normalized_name=self.normalize_name(match.group(0), normalization_map),
                        start=match.start(),
                        end=match.end(),
                        context=sentence,
                        context_start=sentence_start,
                        context_end=sentence_end,
                    )
                )
        return mentions

    def classify(
        self,
        *,
        case_id: str,
        tenant_id: str,
        source_type: str,
        text: str,
        candidate_drugs: Optional[Iterable[str]] = None,
        normalization_map: Optional[Dict[str, str]] = None,
        company_products: Optional[Iterable[Dict[str, Any]]] = None,
        known_non_company_products: Optional[Iterable[Dict[str, Any]]] = None,
    ) -> DrugRoleResult:
        if not tenant_id or not case_id or not text.strip():
            raise ValueError("case_id, tenant_id and source text are required")
        mentions = self.extract_mentions(text, candidate_drugs, normalization_map)
        grouped = defaultdict(list)
        for mention in mentions:
            grouped[mention.normalized_name.lower()].append(mention)

        classifications: List[DrugClassification] = []
        warnings: List[str] = []

        for key, group in grouped.items():
            normalized = group[0].normalized_name
            decisions = []
            for mention in group:
                # Anchor evidence locations to the sentence containing the drug.
                sentence_start = mention.context_start
                window_drugs = {m.normalized_name.casefold() for m in mentions if m.context_start == mention.context_start and m.context_end == mention.context_end}
                if len(window_drugs) > 1:
                    decisions.append((DrugRole.UNKNOWN, 0.0, "Multiple drugs share a role cue; drug-specific attribution requires review.", []))
                else:
                    decisions.append(classify_context(mention.context, sentence_start))

            role, confidence, rationale, evidence = merge_role_decisions(decisions)
            # DR-009: company suspect classification is applicable to SUSPECT drugs only.
            if role == DrugRole.SUSPECT:
                ownership, pm_match, ownership_reason = resolve_ownership(
                    normalized,
                    company_products or [],
                    known_non_company_products,
                )
            else:
                ownership, pm_match = Ownership.UNKNOWN, None
                ownership_reason = "Company suspect classification not applicable to non-suspect drug role."

            requires_review = (
                role == DrugRole.UNKNOWN
                or (role == DrugRole.SUSPECT and ownership == Ownership.UNKNOWN)
                or confidence < 0.80
                or "Conflicting" in rationale
            )

            classifications.append(
                DrugClassification(
                    reported_name=group[0].reported_name,
                    normalized_name=normalized,
                    role=role,
                    ownership=ownership,
                    confidence=round(confidence, 4),
                    rationale=f"{rationale} {ownership_reason}",
                    evidence=evidence,
                    product_master_match=pm_match,
                    requires_human_review=requires_review,
                )
            )

        if not classifications:
            warnings.append("No drug mentions were extracted. Supply upstream NER/WHO Drug candidates for best recall.")

        # Important PV governance rule: absence from Product Master is not proof of non-company status.
        if any(c.ownership.value == "UNKNOWN" for c in classifications):
            warnings.append("One or more ownership decisions remain UNKNOWN because controlled product ownership was not proven.")

        return DrugRoleResult(
            case_id=case_id,
            tenant_id=tenant_id,
            source_type=source_type,
            classifications=classifications,
            review_required=not classifications or any(c.requires_human_review for c in classifications),
            warnings=warnings,
        )
