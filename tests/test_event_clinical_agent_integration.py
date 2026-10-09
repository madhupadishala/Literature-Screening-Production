"""Agent-level checks for source-grounded AE clinical gates."""
import asyncio
import base64
import unittest
from backend.agents.event_runtime.engine import EventEngine
from backend.agents.event_runtime.models import (
    Block, Document, Extraction, Finding, Mention, Request, Verification,
)

class AEClinicalIntegration(unittest.TestCase):
    def simulate(self, text, verbatim, diagnosis, role="event", outcome_quote=None):
        block=Block(id="b1",document_id="doc1",locator="plain/chars:0-100",text=text)
        start=text.index(verbatim)
        m=Mention(block_id="b1",start=start,end=start+len(verbatim),verbatim=verbatim,
           patient_id="P1",patient_evidence="P1",assertion="affirmed",role=role,
           diagnosis_status=diagnosis,context_quote=text,rationale="explicit source quote",
           onset_quote=None,outcome_quote=outcome_quote)
        # Anchor patient evidence directly in the source.
        class Provider:
            async def extract(self, block):
                return Extraction(mentions=[m], unresolved=[])
            async def verify(self, block, extracted):
                return Verification(findings=[Finding(mention_index=0,disposition="supported",reason="exact evidence")],missed_evidence=[])
        engine=object.__new__(EventEngine)
        engine.semaphore=asyncio.Semaphore(1)
        engine.provider=Provider()
        engine.dictionary=None
        request=Request(case_id="case1",documents=[Document(id="doc1",media_type="text/plain",
                        content_base64=base64.b64encode(text.encode()).decode())])
        return asyncio.run(engine.extract_verify(
            {"blocks":[block],"issues":[],"failed":[],"request":request}))

    def test_lab_observation_not_promoted_to_event(self):
        output=self.simulate("P1 had ALT 103 U/L.","ALT 103 U/L","lab_finding")
        self.assertEqual(len(output["events"]),0)
        self.assertEqual(output["observations"][0]["disposition"],"lab_observation_requires_review")

    def test_figurative_statement_not_coded_as_death(self):
        output=self.simulate("P1 said I felt like I died.","felt like I died","symptom_sign")
        self.assertEqual(len(output["events"]),0)
        self.assertEqual(output["observations"][0]["disposition"],"figurative_death_requires_review")

    def test_source_verified_nonclinical_complaint_not_event(self):
        output = self.simulate(
            "P1 reported damaged packaging, without any patient symptom.",
            "damaged packaging", "other", role="unknown")
        self.assertEqual(len(output["events"]), 0)
        self.assertEqual(output["observations"][0]["disposition"], "nonclinical_complaint")
        self.assertEqual(output["observations"][0]["clinical_rule"]["rule_id"], "AE-003")

    def test_explicit_clinical_event_not_blocked_by_complaint_guard(self):
        output = self.simulate(
            "P1 developed rash after reporting damaged packaging.",
            "rash", "symptom_sign", role="event")
        self.assertEqual(len(output["events"]), 1)

    def test_explicit_reported_rash_retained(self):
        output=self.simulate("P1 developed rash.","rash","symptom_sign")
        self.assertEqual(len(output["events"]),1)
        self.assertEqual(output["events"][0].verbatim,"rash")



    def test_reported_outcome_is_mapped_not_inferred(self):
        output=self.simulate("P1 developed rash and the rash resolved.","rash",
                             "symptom_sign",outcome_quote="the rash resolved")
        self.assertEqual(len(output["events"]),1)
        self.assertEqual(output["events"][0].outcome,"recovered_resolved")
        self.assertEqual(output["events"][0].outcome_quote,"the rash resolved")

    def test_two_explicit_reported_events_are_not_collapsed(self):
        text="P1 experienced rash and itching."
        block=Block(id="b1",document_id="doc1",locator="plain/chars:0-100",text=text)
        mentions=[]
        for event in ("rash","itching"):
            start=text.index(event)
            mentions.append(Mention(block_id="b1",start=start,end=start+len(event),
              verbatim=event,patient_id="P1",patient_evidence="P1",
              assertion="affirmed",role="event",diagnosis_status="symptom_sign",
              context_quote=text,rationale="explicitly reported",
              onset_quote=None,outcome_quote=None))
        class Provider:
            async def extract(self, block):
                return Extraction(mentions=mentions,unresolved=[])
            async def verify(self, block, extracted):
                return Verification(findings=[
                    Finding(mention_index=i,disposition="supported",reason="exact quote")
                    for i in range(len(mentions))],missed_evidence=[])
        engine=object.__new__(EventEngine)
        engine.provider=Provider()
        engine.dictionary=None
        engine.semaphore=asyncio.Semaphore(1)
        request=Request(case_id="case1",documents=[Document(
            id="doc1",media_type="text/plain",
            content_base64=base64.b64encode(text.encode()).decode())])
        output=asyncio.run(engine.extract_verify(
            {"blocks":[block],"issues":[],"failed":[],"request":request}))
        self.assertEqual({e.verbatim for e in output["events"]},{"rash","itching"})
        self.assertEqual(len(output["events"]),2)

if __name__=="__main__":
    unittest.main()
