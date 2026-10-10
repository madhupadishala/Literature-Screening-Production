import asyncio
from hashlib import sha256
from typing import TypedDict
from uuid import uuid4
import base64

def document_hash(value):
    try:
        return sha256(base64.b64decode(value, validate=True)).hexdigest()
    except Exception:
        return None
from langgraph.graph import StateGraph, START, END
from .models import Request, Result, Event, Evidence
from .ingestion import unpack
from .prompts import PROMPT_VERSION
from .outcome_policy import outcome_from_quote
from backend.knowledge.executable_clinical_gates import evaluate_approved_gate

class State(TypedDict, total=False):
    request: Request
    blocks: list
    events: list
    observations: list
    issues: list
    completed: list
    failed: list
    structured_records: list
    result: Result

class EventEngine:
    def __init__(self, provider, dictionary=None, concurrency=4, ocr=None, schema_bundle=None):
        if not 1 <= concurrency <= 16:
            raise ValueError("invalid concurrency")
        self.provider, self.dictionary, self.ocr = provider, dictionary, ocr
        self.schema_bundle = schema_bundle
        self.semaphore = asyncio.Semaphore(concurrency)
        graph = StateGraph(State)
        graph.add_node("ingest", self.ingest)
        graph.add_node("extract_verify", self.extract_verify)
        graph.add_node("reconcile", self.reconcile)
        graph.add_node("finalize", self.finalize)
        graph.add_edge(START, "ingest")
        graph.add_edge("ingest", "extract_verify")
        graph.add_edge("extract_verify", "reconcile")
        graph.add_edge("reconcile", "finalize")
        graph.add_edge("finalize", END)
        self.graph = graph.compile()

    async def run(self, request: Request) -> Result:
        state = await self.graph.ainvoke({"request": request})
        return state["result"]

    async def ingest(self, state):
        blocks, issues, failed, records = [], [], [], []
        for doc in state["request"].documents:
            try:
                if doc.media_type == "application/xml":
                    from .e2b import parse
                    from .models import Block
                    parsed = parse(base64.b64decode(doc.content_base64, validate=True), doc.id, self.schema_bundle)
                    records.extend(parsed["records"])
                    if parsed.get("attachments_require_ingestion"):
                        issues.append(f"embedded_or_referenced_attachments_unprocessed:{doc.id}")
                    issues.append(f"e2b_regional_validation_pending:{doc.id}")
                    for locator, text in parsed["narratives"]:
                        # Retain narrative blocks for contextual reconciliation; coded records do not use LLM.
                        for offset in range(0, len(text), 5400):
                            chunk = text[offset:offset+6000]
                            bid = sha256(f"{doc.id}:{locator}:{offset}".encode()).hexdigest()[:24]
                            blocks.append(Block(id=bid, document_id=doc.id, locator=f"{locator}/chars:{offset}-{offset+len(chunk)}", text=chunk))
                else:
                    blocks.extend(unpack(doc, self.ocr))
            except Exception:
                # Do not expose raw parser exceptions/clinical content in logs.
                issues.append(f"ingestion_failed:{doc.id}")
                failed.append(doc.id)

        if len(blocks) > 300:
            issues.append("block_budget_exceeded; split case into reviewed processing jobs")
            failed.extend(b.id for b in blocks)
            blocks = []
        return {"blocks": blocks, "issues": issues, "failed": failed, "structured_records": records}

    async def process(self, block):
        async with self.semaphore:
            try:
                async with asyncio.timeout(150):
                    extracted = await self.provider.extract(block)
                    verification = await self.provider.verify(block, extracted)
                return block, extracted, verification, None
            except Exception:
                return block, None, None, "extraction_or_verification_failed"

    async def extract_verify(self, state):
        events, observations, completed = [], [], []
        issues = list(state["issues"])
        failed = list(state["failed"])
        # Bounded batches avoid creating thousands of tasks for long documents.
        for offset in range(0, len(state["blocks"]), 16):
            rows = await asyncio.gather(*(self.process(b) for b in state["blocks"][offset:offset+16]))
            for block, extracted, verified, error in rows:
                if error:
                    failed.append(block.id)
                    issues.append(f"{error}:{block.id}")
                    continue
                completed.append(block.id)
                issues.extend(f"unresolved:{block.id}:{x}" for x in extracted.unresolved)
                if verified.missed_evidence:
                    issues.append(f"verifier_detected_omission:{block.id}")
                findings = {f.mention_index: f for f in verified.findings}
                if len(findings) != len(verified.findings) or set(findings) != set(range(len(extracted.mentions))):
                    issues.append(f"invalid_verifier_contract:{block.id}")
                    failed.append(block.id)
                    continue
                for i, mention in enumerate(extracted.mentions):
                    finding = findings[i]
                    obs = {"mention": mention.model_dump(), "verification": finding.model_dump(), "block_id": block.id}
                    valid = (mention.block_id == block.id and mention.start < mention.end <= len(block.text)
                             and block.text[mention.start:mention.end] == mention.verbatim
                             and mention.context_quote in block.text
                             and mention.verbatim in mention.context_quote
                             and any(a <= mention.start and mention.end <= a+len(mention.context_quote)
                                     for a in self.positions(block.text, mention.context_quote)))
                    for quote in (mention.patient_evidence, mention.onset_quote, mention.outcome_quote):
                        if quote is not None and quote not in block.text:
                            valid = False
                    if mention.patient_id is not None:
                        if not mention.patient_evidence or mention.patient_id not in mention.patient_evidence:
                            valid = False
                    if not valid:
                        obs["disposition"] = "invalid_evidence"
                        issues.append(f"invalid_evidence:{block.id}:{i}")
                    elif mention.role == "event" and mention.diagnosis_status == "lab_finding":
                        # AE-002: lab observations alone are not inferred as AEs.
                        # Retain verbatim evidence for a clinician to confirm an
                        # explicitly reported clinical event rather than generating one.
                        obs["clinical_rule"] = evaluate_approved_gate(
                            "AE-002", {"measurement_only": True,
                                       "explicit_ae_reported": False})
                        obs["disposition"] = "lab_observation_requires_review"
                        issues.append(f"clinical_review_lab_observation:{block.id}:{i}")
                    elif mention.role == "event" and "felt like i died" in mention.verbatim.casefold():
                        # AE-004: don't turn a figurative statement into death.
                        obs["clinical_rule"] = evaluate_approved_gate(
                            "AE-004", {"figurative_death_statement": True})
                        obs["disposition"] = "figurative_death_requires_review"
                        issues.append(f"clinical_review_figurative_death:{block.id}:{i}")
                    elif (finding.disposition == "supported"
                          and mention.role == "unknown"
                          and mention.diagnosis_status == "other"
                          and any(phrase in mention.verbatim.casefold() for phrase in
                                  ("damaged packaging", "broken packaging",
                                   "missing tablets", "incorrect label"))):
                        # AE-003: validated non-clinical product complaints are
                        # observations, not inferred patient adverse events.
                        # Do not apply this gate to an explicitly reported AE.
                        obs["clinical_rule"] = evaluate_approved_gate(
                            "AE-003", {"nonclinical_complaint_only": True,
                                       "explicit_clinical_event": False})
                        obs["disposition"] = "nonclinical_complaint"
                    elif finding.disposition != "supported":
                        obs["disposition"] = finding.disposition
                        issues.append(f"verification_{finding.disposition}:{block.id}:{i}")
                    elif mention.role != "event" or mention.assertion not in ("affirmed", "uncertain"):
                        obs["disposition"] = "context_only"
                    elif not mention.patient_id:
                        obs["disposition"] = "unresolved_patient"
                        issues.append(f"unresolved_patient:{block.id}:{i}")
                    else:
                        base_locator, span = block.locator.rsplit("/chars:", 1)
                        origin = int(span.split("-")[0])
                        eid = sha256(f"{block.document_id}:{base_locator}:{origin+mention.start}:{origin+mention.end}:{mention.patient_id}".encode()).hexdigest()[:24]
                        language = next(d.language for d in state["request"].documents if d.id == block.document_id)
                        coding = self.dictionary.suggest(mention.verbatim, language) if self.dictionary else None
                        events.append(Event(id=eid, patient_id=f"{block.document_id}:{mention.patient_id}",
                            verbatim=mention.verbatim, assertion=mention.assertion,
                            diagnosis_status=mention.diagnosis_status, role=mention.role,
                            onset_quote=mention.onset_quote, outcome_quote=mention.outcome_quote,
                            outcome=outcome_from_quote(mention.outcome_quote), coding=coding,
                            evidence=[Evidence(document_id=block.document_id, block_id=block.id,
                            locator=block.locator, start=mention.start, end=mention.end,
                            quote=mention.verbatim, context_quote=mention.context_quote)]))
                        obs["disposition"] = "event_proposal"
                    observations.append(obs)
        return {"events": events, "observations": observations, "issues": issues,
                "completed": completed, "failed": failed}

    @staticmethod
    def positions(text, quote):
        start = 0
        while (position := text.find(quote, start)) >= 0:
            yield position
            start = position + 1

    async def reconcile(self, state):
        # Never merge distinct episodes merely because they have the same term.
        # Preserve cross-document identities until Nexus supplies a reviewed patient map.
        unique = {e.id: e for e in state["events"]}
        issues = list(state["issues"])
        if len(state["request"].documents) > 1:
            issues.append("cross_document_patient_and_followup_reconciliation_required")
        return {"events": list(unique.values()), "issues": issues}

    async def finalize(self, state):
        incomplete = bool(state["failed"] or any(x.startswith(("invalid_evidence", "invalid_verifier_contract", "verifier_detected_omission", "e2b_regional_validation_pending")) for x in state["issues"]))
        result = Result(run_id=str(uuid4()), case_id=state["request"].case_id,
            status="incomplete" if incomplete else "review_required",
            events=state["events"], observations=state["observations"], structured_records=state["structured_records"], issues=state["issues"],
            coverage={"document_count": len(state["request"].documents), "block_count": len(state["blocks"]),
                      "processed_block_ids": state["completed"], "failed_ids": state["failed"],
                      "text_processing_complete": not state["failed"], "clinical_completeness_certified": False},
            provenance={"agent_version": "0.2.0", "prompt_version": PROMPT_VERSION,
                        "model": self.provider.identity,
                        "dictionary_version": self.dictionary.version if self.dictionary else None,
                        "ocr_used": any(b.ingestion_metadata for b in state["blocks"]),
                        "ingestion_metadata": {b.id:b.ingestion_metadata for b in state["blocks"] if b.ingestion_metadata},
                        "document_sha256": {d.id: document_hash(d.content_base64) for d in state["request"].documents}})
        return {"result": result}
