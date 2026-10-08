from __future__ import annotations

import hashlib
import json
from datetime import date

from . import config as K
from .audit import AuditLog
from .extraction import Extractor
from .kb import KnowledgeStore, best_quote, check_link, make_citation, tokenize
from .nexus_kb import NexusKnowledgeClient, RetrievalRequest
from .rulepacks import REGISTRY, ClauseLink, Inputs, load_policy_links
from .clinical import derive_structured
from .orchestrator import CausalityOrchestrator, NODE_ORDER
from .schemas import (AgentStep, CaseAssessment, CaseInput, Category, Citation, Drug, Event,
                      EvidenceDimension, Factor, FactorResult, PairAssessment)
from .timeline import compute
from .verification import quote_verified

HITL_ALWAYS = {Category.CERTAIN, Category.UNLIKELY, Category.CONDITIONAL, Category.UNASSESSABLE}
RELATED = {Category.CERTAIN, Category.PROBABLE, Category.POSSIBLE}


def _n(s: str) -> str:
    return " ".join(s.lower().split())


class LabelTable:
    """Structured label/RSI lookup (authoritative; used before any RAG)."""

    def __init__(self, data: dict[str, list[str]] | None = None):
        self.d = {_n(k): {_n(e) for e in v} for k, v in (data or {}).items()}

    def lookup(self, drug: str, event: str) -> bool:
        return _n(event) in self.d.get(_n(drug), set())


def _consensus(samples, factor: Factor, narrative: str) -> FactorResult:
    vals = [(fv.value, fv.quote) for s in samples for fv in s.factors if fv.factor == factor]
    if not vals:
        return FactorResult(value="unknown", state="failed")
    values = {v for v, _ in vals}
    if len(values) > 1:
        return FactorResult(value="unknown", state="disagree")
    v = values.pop()
    if v == "unknown":
        return FactorResult(value="unknown", state="unknown")
    if all(quote_verified(q, narrative) for _, q in vals):
        return FactorResult(value=v, state="ok", quote=vals[0][1])
    return FactorResult(value="unknown", state="unverified", quote=vals[0][1])


def _merge_alt(structured: str, extracted: FactorResult) -> FactorResult:
    """Conservative merge of structured and narrative alternative-cause evidence."""
    if structured == "yes" or extracted.value == "yes":
        return FactorResult(value="yes", state="structured" if structured == "yes" else extracted.state,
                            quote=extracted.quote)
    if structured == "no":
        return FactorResult(value="no", state="structured", quote=extracted.quote)
    return extracted


def _step(agent: str, status: str, summary: str, *keys: str, warnings=None) -> AgentStep:
    return AgentStep(agent=agent, status=status, summary=summary, evidence_keys=list(keys),
                     warnings=list(warnings or []))


class CausalityPipeline:
    def __init__(self, extractor: Extractor, audit: AuditLog, cfg: K.Config, store: KnowledgeStore,
                 pins: dict[str, str] | None = None, policy_links: dict[str, ClauseLink] | None = None,
                 label_table: LabelTable | None = None, nexus_client: NexusKnowledgeClient | None = None):
        self.extractor, self.audit, self.cfg, self.store = extractor, audit, cfg, store
        self.pins = pins or {}
        self.policy_links = policy_links if policy_links is not None else load_policy_links()
        self.labels = label_table or LabelTable()
        self.nexus_client = nexus_client

    # ------------------------------------------------------------------
    def _nexus_retrieve(self, *, tenant: str, client_id: str | None, query: str,
                        types: tuple[str, ...], juris: str, as_of: date,
                        product: str | None = None, event: str | None = None,
                        top_k: int = 5):
        if self.nexus_client is None:
            return None
        return self.nexus_client.retrieve(RetrievalRequest(
            tenant_id=tenant, client_id=client_id, query=query, knowledge_types=types,
            jurisdiction=juris, as_of=as_of, product=product, event=event, top_k=top_k))

    def _product_evidence(self, drug: str, event: str, as_of: date, juris: str,
                          tenant: str, client_id: str | None) -> tuple[str, list[Citation], str | None, list[str]]:
        if self.labels.lookup(drug, event):
            return "yes", [], "structured-label-table", []

        cites: list[Citation] = []
        warnings: list[str] = []
        snapshot_id = None
        et, dt = set(tokenize(event)), set(tokenize(drug))

        nr = self._nexus_retrieve(tenant=tenant, client_id=client_id, query=f"{drug} {event}",
                                  types=("product", "label", "rsi", "ccds", "smpc", "uspi"),
                                  juris=juris, as_of=as_of, product=drug, event=event, top_k=5)
        if nr is not None:
            snapshot_id = nr.snapshot_id
            warnings.extend(nr.warnings)
            for c in nr.citations:
                ct = set(tokenize(c.quote))
                if et <= ct and (dt <= ct or not dt):
                    cites.append(c)

        # Backward-compatible local governed retrieval.
        if not cites:
            for h in self.store.search(f"{drug} {event}", ["product"], juris, as_of, tenant, top_k=3):
                ct = set(tokenize(h.chunk.text))
                if et <= ct and dt <= ct:
                    q = next((s for s in h.chunk.text.replace("\n", ". ").split(". ")
                              if et <= set(tokenize(s))), None)
                    c = make_citation(h.chunk, q.strip() if q else None)
                    if c:
                        cites.append(c)
        # retrieval miss is NOT evidence of absence
        return ("yes" if cites else "unknown"), cites, snapshot_id, warnings

    def _clauses(self, links: dict[str, ClauseLink], rule_ids, as_of, juris, tenant, query):
        reasons, cites = [], []
        for rid in rule_ids:
            link = links.get(rid)
            if link is None:
                continue
            status, chunk = check_link(link, self.store, self.pins, as_of, juris, tenant)
            if status == "ok":
                c = make_citation(chunk, best_quote(chunk, query))
                if c:
                    cites.append(c)
            elif self.cfg.require_policy_clauses:
                reasons.append(f"clause:{rid}:{status}")
        return reasons, cites

    def _regulatory_context(self, case: CaseInput, tenant: str, as_of: date) -> tuple[list[Citation], str | None, list[str]]:
        cites: list[Citation] = []
        snapshot = None
        warnings: list[str] = []
        nr = self._nexus_retrieve(tenant=tenant, client_id=case.client_id,
                                  query="causality assessment reporter sender company rationale pharmacovigilance",
                                  types=("regulatory", "methodology", "sop", "governance"),
                                  juris=case.jurisdiction, as_of=as_of, top_k=5)
        if nr is not None:
            cites.extend(nr.citations)
            snapshot = nr.snapshot_id
            warnings.extend(nr.warnings)
        if not cites:
            for h in self.store.search("reporter causality assessment company causality", ["regulatory"],
                                       case.jurisdiction, as_of, tenant, top_k=2):
                c = make_citation(h.chunk, best_quote(h.chunk, "causality assessment reporter"))
                if c:
                    cites.append(c)
        return cites, snapshot, warnings

    # ------------------------------------------------------------------
    def _pair(self, case: CaseInput, drug: Drug, event: Event, method_id: str, tenant: str,
              as_of: date) -> PairAssessment:
        pack = REGISTRY[method_id]
        state: dict = {
            "case": case, "drug_obj": drug, "event_obj": event, "tenant": tenant,
            "as_of": as_of, "pack": pack, "reasons": [], "agent_steps": [],
        }

        def pair_formation(s):
            return {"pair_key": f"{case.case_id}|{drug.name}|{event.term}",
                    "agent_steps": s["agent_steps"] + [_step("Pair Formation Agent", "ok",
                        "Formed one assessable drug-event pair from suspect/interacting product and event.")]}

        def timeline_node(s):
            tl = compute(drug, event)
            status = "warning" if tl.data_issues or tl.temporal in ("unknown", "after_stop") else "ok"
            return {"timeline": tl,
                    "agent_steps": s["agent_steps"] + [_step("Chronology Agent", status,
                        f"Deterministic chronology={tl.temporal}; time-to-onset={tl.time_to_onset_days} days.",
                        "chronology", warnings=tl.data_issues)]}

        def extraction_node(s):
            samples, failures = [], 0
            for i in range(max(1, self.cfg.samples)):
                try:
                    samples.append(self.extractor.extract(case.narrative, drug.name, event.term, i))
                except Exception:
                    failures += 1
            factors = {f: _consensus(samples, f, case.narrative) for f in Factor}
            if drug.rechallenge is not None:
                factors[Factor.RECHALLENGE] = FactorResult(value=drug.rechallenge, state="structured")
            reasons = list(s["reasons"])
            if failures:
                reasons.append("extraction_error")
            for f, r in factors.items():
                if r.state in ("unverified", "disagree", "failed"):
                    reasons.append(f"{f.value}:{r.state}")
            status = "warning" if failures or any(r.state in ("unverified", "disagree", "failed") for r in factors.values()) else "ok"
            return {"samples": samples, "factors": factors, "reasons": reasons,
                    "agent_steps": s["agent_steps"] + [_step("Evidence Extraction Agent", status,
                        "Extracted narrow causality facts using multi-sample consensus and quote verification.",
                        "alternative_causes", "rechallenge", "objective_evidence")]}

        def clinical_node(s):
            structured = derive_structured(drug, event, s["timeline"])
            warnings = list(structured.issues)
            return {"structured": structured,
                    "agent_steps": s["agent_steps"] + [_step("Temporal & Clinical Evidence Agent",
                        "warning" if warnings or structured.temporal_plausibility == "indeterminate" else "ok",
                        f"Temporal plausibility={structured.temporal_plausibility}; dechallenge interpretability={structured.dechallenge_interpretability}.",
                        "temporal_plausibility", "latency_fit", "dechallenge_interpretability",
                        "recovery_fit", warnings=warnings)]}

        def knowledge_node(s):
            label, product_cites, snap, warnings = self._product_evidence(
                drug.name, event.term, as_of, case.jurisdiction, tenant, case.client_id)
            return {"label": label, "product_cites": product_cites,
                    "knowledge_snapshot_id": snap, "kb_warnings": warnings,
                    "agent_steps": s["agent_steps"] + [_step("Known Association / Label Evidence Agent",
                        "ok" if label == "yes" else "warning",
                        f"Governed product/label evidence result={label}; retrieval miss remains unknown.",
                        "known_association", warnings=warnings)]}

        def alternative_node(s):
            factors = dict(s["factors"])
            alt = _merge_alt(s["structured"].structured_alternative_causes, factors[Factor.ALTERNATIVE_CAUSES])
            factors[Factor.ALTERNATIVE_CAUSES] = alt
            reasons = list(s["reasons"])
            if alt.value == "unknown":
                reasons.append("alternative_causes:unknown")
            return {"factors": factors, "reasons": reasons,
                    "agent_steps": s["agent_steps"] + [_step("Alternative Etiology Agent",
                        "warning" if alt.value == "unknown" else "ok",
                        f"Alternative etiology={alt.value}; structured evidence is merged conservatively with verified narrative evidence.",
                        "alternative_causes")]}

        def dr_node(s):
            st = s["structured"]
            rech = s["factors"][Factor.RECHALLENGE].value
            warnings = []
            if st.dechallenge_interpretability == "confounded":
                warnings.append("dechallenge_confounded")
            return {"agent_steps": s["agent_steps"] + [_step("Dechallenge / Rechallenge Agent",
                        "warning" if warnings or rech == "unknown" else "ok",
                        f"Dechallenge={st.dechallenge_response}/{st.dechallenge_interpretability}; rechallenge={rech}.",
                        "dechallenge_interpretability", "rechallenge", warnings=warnings)]}

        def method_node(s):
            structured = s["structured"]
            evidence_payload = structured.as_dict()
            evidence_payload["alternative_causes"] = s["factors"][Factor.ALTERNATIVE_CAUSES].value
            evidence_payload["known_association"] = s["label"]
            out = pack.assess(Inputs(
                temporal=s["timeline"].temporal, dechallenge=s["timeline"].dechallenge,
                rechallenge=s["factors"][Factor.RECHALLENGE].value,
                factors={f: r.value for f, r in s["factors"].items()},
                label_listed=s["label"], follow_up_exhausted=case.follow_up_exhausted,
                evidence=evidence_payload))
            reasons = list(s["reasons"])
            if s["timeline"].temporal == "after_stop":
                reasons.append("temporal:after_stop")
            reasons += [f"data_issue:{x}" for x in s["timeline"].data_issues]
            reasons += [f"flag:{x}" for x in out.flags]
            reasons += [f"missing:{x}" for x in out.missing]
            return {"outcome": out, "evidence_payload": evidence_payload, "reasons": reasons,
                    "agent_steps": s["agent_steps"] + [_step("WHO-UMC / Method Decision Engine", "ok",
                        f"Deterministic method {pack.method_id} classified the pair as {out.category.value}.",
                        "method_category")]}

        def regulatory_node(s):
            out = s["outcome"]
            q = f"{out.category.value} {out.detail}"
            r1, policy_cites = self._clauses(pack.links, out.fired, as_of, case.jurisdiction, tenant, q)
            r2, pol2 = self._clauses(self.policy_links, list(self.policy_links), as_of, case.jurisdiction,
                                     tenant, "reporter causality assessment company rationale")
            policy_cites += pol2
            reg_ctx, snap2, warnings = self._regulatory_context(case, tenant, as_of)
            reasons = list(s["reasons"]) + r1 + r2
            snapshot = s.get("knowledge_snapshot_id") or snap2
            return {"policy_cites": policy_cites, "reg_context": reg_ctx,
                    "knowledge_snapshot_id": snapshot, "reasons": reasons,
                    "agent_steps": s["agent_steps"] + [_step("Regulatory Grounding Agent",
                        "warning" if r1 or r2 or warnings else "ok",
                        "Retrieved and drift-checked applicable method/regulatory clauses.",
                        "policy_basis", "regulatory_context", warnings=r1 + r2 + warnings)]}

        def conflict_node(s):
            out = s["outcome"]
            rep = next((r.related for r in case.reporter_causality
                        if _n(r.drug) == _n(drug.name) and _n(r.event) == _n(event.term)), None)
            disagree = (rep is True and out.category == Category.UNLIKELY) or \
                       (rep is False and out.category in RELATED)
            reasons = list(s["reasons"])
            if disagree:
                reasons.append("reporter_disagreement_requires_rationale")
            if out.category in HITL_ALWAYS:
                reasons.append(f"category_requires_review:{out.category.value}")
            if not self.cfg.auto_enabled:
                reasons.append("auto_disabled_pending_validation")
            if s.get("kb_warnings"):
                reasons += [f"kb:{w}" for w in s["kb_warnings"]]
            reasons = list(dict.fromkeys(reasons))
            status = "warning" if reasons else "ok"
            return {"reporter_related": rep, "reporter_disagreement": disagree, "reasons": reasons,
                    "agent_steps": s["agent_steps"] + [_step("Conflict & Quality Gate", status,
                        f"Quality gate found {len(reasons)} review reason(s).", warnings=reasons)]}

        def rationale_node(s):
            st = s["structured"]; factors = s["factors"]; out = s["outcome"]
            ev = {
                "chronology": EvidenceDimension(value=st.chronology, source="derived", confidence="high"),
                "temporal_plausibility": EvidenceDimension(value=st.temporal_plausibility, source="derived",
                    confidence="high" if st.temporal_plausibility != "indeterminate" else "unknown"),
                "latency_fit": EvidenceDimension(value=st.latency_fit, source="derived",
                    confidence="high" if st.latency_fit != "unknown" else "unknown"),
                "exposure_present_at_onset": EvidenceDimension(value=st.exposure_present_at_onset, source="derived", confidence="high"),
                "dechallenge_interpretability": EvidenceDimension(value=st.dechallenge_interpretability, source="derived", confidence="high"),
                "recovery_fit": EvidenceDimension(value=st.recovery_fit, source="derived",
                    confidence="high" if st.recovery_fit != "unknown" else "unknown"),
                "rechallenge": EvidenceDimension(value=factors[Factor.RECHALLENGE].value,
                    source="structured" if factors[Factor.RECHALLENGE].state == "structured" else "narrative",
                    confidence="high" if factors[Factor.RECHALLENGE].value != "unknown" else "unknown"),
                "alternative_causes": EvidenceDimension(value=factors[Factor.ALTERNATIVE_CAUSES].value,
                    source="structured" if factors[Factor.ALTERNATIVE_CAUSES].state == "structured" else "narrative",
                    confidence="high" if factors[Factor.ALTERNATIVE_CAUSES].value != "unknown" else "unknown"),
                "known_association": EvidenceDimension(value=s["label"], source="knowledge",
                    confidence="high" if s["label"] == "yes" else "unknown"),
                "dose_response": EvidenceDimension(value=st.dose_response, source="structured",
                    confidence="high" if st.dose_response != "unknown" else "unknown"),
                "prior_exposure": EvidenceDimension(value=st.prior_exposure, source="structured",
                    confidence="high" if st.prior_exposure != "unknown" else "unknown"),
                "objective_evidence": EvidenceDimension(value=st.objective_evidence, source="structured",
                    confidence="high" if st.objective_evidence != "unknown" else "unknown"),
                "biologic_plausibility": EvidenceDimension(value=st.biologic_plausibility, source="structured",
                    confidence="high" if st.biologic_plausibility != "unknown" else "unknown"),
                "class_effect": EvidenceDimension(value=st.class_effect, source="structured",
                    confidence="high" if st.class_effect != "unknown" else "unknown"),
                "data_completeness": EvidenceDimension(value=st.data_completeness, source="derived", confidence="high"),
            }
            explanation = (f"{out.category.value.capitalize()} via {pack.method_id}: {out.detail}. "
                           f"Temporal={st.temporal_plausibility} (chronology={st.chronology}, latency={st.latency_fit}); "
                           f"dechallenge={st.dechallenge_response}/{st.dechallenge_interpretability}, "
                           f"rechallenge={factors[Factor.RECHALLENGE].value}; "
                           f"alternative_causes={factors[Factor.ALTERNATIVE_CAUSES].value}; "
                           f"known_association={s['label']}; objective_evidence={st.objective_evidence}.")
            critical_unknown = any(ev[k].value in ("unknown", "indeterminate") for k in
                                   ("temporal_plausibility", "alternative_causes"))
            if s["reasons"] or critical_unknown:
                confidence = "low"
            elif st.data_completeness == "adequate" and out.category in (Category.PROBABLE, Category.CERTAIN):
                confidence = "high"
            else:
                confidence = "medium"
            return {"evidence": ev, "explanation": explanation, "confidence": confidence,
                    "agent_steps": s["agent_steps"] + [_step("Rationale Synthesis Agent", "ok",
                        "Generated an evidence-bounded rationale from verified/structured facts only.")]}

        def routing_node(s):
            route = "hitl" if s["reasons"] else "auto"
            return {"route": route,
                    "agent_steps": s["agent_steps"] + [_step("Routing & Audit Agent", "ok",
                        f"Final route={route}; auto-release remains governed by configuration and release gates.")]}

        nodes = {
            "pair_formation": pair_formation,
            "timeline": timeline_node,
            "fact_extraction": extraction_node,
            "clinical_evidence": clinical_node,
            "knowledge_retrieval": knowledge_node,
            "alternative_etiology": alternative_node,
            "dechallenge_rechallenge": dr_node,
            "method_engine": method_node,
            "regulatory_grounding": regulatory_node,
            "conflict_quality_gate": conflict_node,
            "rationale_synthesis": rationale_node,
            "routing_audit": routing_node,
        }
        state, trace = CausalityOrchestrator(nodes).run(state)
        if trace.warnings:
            state["reasons"] = list(dict.fromkeys(state.get("reasons", []) + trace.warnings))
            state["route"] = "hitl"

        out = state["outcome"]
        fr = {f.value: r for f, r in state["factors"].items()}
        return PairAssessment(
            case_id=case.case_id, drug=drug.name, event=event.term, method=pack.method_id,
            rule_pack_version=pack.version, category=out.category, method_detail=out.detail,
            fired_rules=out.fired, missing_data=out.missing, timeline=state["timeline"],
            evidence=state["evidence"], factors=fr, label_listed=state["label"],
            reporter_related=state["reporter_related"], reporter_disagreement=state["reporter_disagreement"],
            policy_basis=state["policy_cites"], product_evidence=state["product_cites"],
            regulatory_context=state["reg_context"], route=state["route"], review_reasons=state["reasons"],
            explanation=state["explanation"], orchestration_trace=list(trace.nodes),
            agent_steps=state["agent_steps"], confidence=state["confidence"],
            knowledge_snapshot_id=state.get("knowledge_snapshot_id"))

    # ------------------------------------------------------------------
    def assess(self, case: CaseInput, tenant_id: str) -> CaseAssessment:
        method = self.cfg.method_for(tenant_id)
        if method not in REGISTRY:
            raise ValueError(f"unknown causality method: {method}")
        as_of = case.as_of or date.today()
        suspects = [d for d in case.drugs if d.role in ("suspect", "interacting")]
        pairs = [self._pair(case, d, e, method, tenant_id, as_of) for d in suspects for e in case.events]

        case_reasons = []
        if not suspects:
            case_reasons.append("no_suspect_drug")
        if not case.events:
            case_reasons.append("no_events")
        route = "hitl" if (case_reasons or any(p.route == "hitl" for p in pairs)) else "auto"
        kb_keys = sorted({f"{c.source}|{c.section_id}|{c.version}" for p in pairs
                          for c in p.policy_basis + p.product_evidence + p.regulatory_context})
        snapshot_ids = sorted({p.knowledge_snapshot_id for p in pairs if p.knowledge_snapshot_id})
        versions = {"pipeline": K.PIPELINE_VERSION, "method": method,
                    "rule_pack": REGISTRY[method].version, "prompt": K.PROMPT_VERSION,
                    "extractor": self.extractor.name, "model": self.cfg.model or "n/a",
                    "kb_snapshot": ("+".join(snapshot_ids) if snapshot_ids else
                                    hashlib.sha256("\n".join(kb_keys).encode()).hexdigest()[:16])}
        res = CaseAssessment(case_id=case.case_id, pairs=pairs, route=route, review_reasons=case_reasons,
                             versions=versions, input_sha256=hashlib.sha256(case.narrative.encode()).hexdigest())
        # PHI minimization: narrative never enters the audit store (hash only)
        res.audit_id = self.audit.append({"tenant": tenant_id, **json.loads(res.model_dump_json())})
        return res
