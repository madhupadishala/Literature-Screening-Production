"""Staging-only synthetic qualification. Abort rather than report an unrun phase as PASS."""
import asyncio, base64, json, os, socket, struct
from pathlib import Path
from uuid import UUID
from Agentic_AI.shared.execution.node_socket_runtime import (
    NodeSocketRuntime, NativeTransportError, probe_native_ready)
from backend.services.pv_agents.rejection_audit import durable_rejection_audit_callback

TENANT="nexus-staging-tenant"
CLIENT="nexus-staging-client"
DOC="SYNTHETIC-ICSR-QA-001"
IDS=("AG08","AG12","AG17","AG20","AG26")

def secret(name):
    value=os.environ.get(name)
    if value: return value.strip()
    file=os.environ.get(name+"_FILE")
    if not file: raise RuntimeError(name+" must be provided by staging secret manager")
    return Path(file).read_text().strip()

def review(result):
    assert result["status"]=="review_required", "review status missing"
    assert result["requires_human_review"] is True, "human review not enforced"
    assessment=result["assessment"]
    assert isinstance(assessment,dict), "assessment object missing"
    assert assessment.get("qualifiedForAutonomousUse",False) is False, "autonomous release allowed"
    assert assessment.get("qualified_for_autonomous_use",False) is False, "autonomous release allowed"

def source(agent):
    base={"document_id":DOC,"source":{}}
    if agent=="AG08":
        return "Synthetic patient P1 experienced nausea in France on 2026-09-10."
    if agent=="AG12":
        return {**base,"source":{"reportedEvent":"nausea","labelEvidence":[]}}
    if agent=="AG17":
        return {**base,"source":{"sourceCoverage":"ABSTRACT_ONLY","publicationType":"CASE_REPORT",
                "humanPopulation":"YES","identifiablePatient":"YES","products":[],
                "specialSituations":[],"adverseEventOrReaction":"PRESENT","eventEvidence":[]}}
    if agent=="AG20":
        return {**base,"source":{"caseDraft":{
            "identification":{"caseKey":DOC,"initialReceiptDate":"2026-09-11",
                "latestReceiptDate":"2026-09-11","seriousnessStatus":"UNRESOLVED"},
            "patient":{"ageValue":45,"ageUnit":"years","sex":"FEMALE"},
            "reporters":[],"products":[{"reportedName":"Synthetic Medicine","roleCharacterization":"SUSPECT"}],
            "events":[{"reportedTerm":"nausea","onsetDate":"2026-09-10"}],
            "tests":[],"medicalHistory":[],"additionalInformation":{}}}}
    if agent=="AG26":
        return {**base,"source":{"patients":[{"age_value":45,"age_unit":"years"}],
                "reporters":[{"qualification":"PHYSICIAN"}],
                "products":[{"reported_name":"Synthetic Medicine"}],
                "events":[{"reported_term":"nausea"}]}}
    raise ValueError(agent)

def request(agent):
    return {"agent_id":agent,"tenant_id":TENANT,"client_id":CLIENT,
            "document_id":DOC,"input":source(agent),
            "knowledge_citations":[{"rule_id":"SYN-QA-ONLY","source":"synthetic"}]}

async def ag02(provider):
    from Agentic_AI.shared.execution.native_event_engine import create_approved_event_runtime
    runtime=create_approved_event_runtime(provider=provider,concurrency=1)
    document={"id":"synthetic-source-1","media_type":"text/plain",
              "content_base64":base64.b64encode(
                 b"Synthetic patient P1 experienced nausea after Synthetic Medicine.").decode(),
              "source_type":"spontaneous"}
    output=await runtime.execute_async({"agent_id":"AG02","tenant_id":TENANT,
        "client_id":CLIENT,"document_id":DOC,
        "input":{"document_id":DOC,"case":{"case_id":DOC,"documents":[document]}}})
    review(output)
    return output

def run_b(signing, sock, approved_event_provider):
    # Genuine injected approved AG02 provider; never fabricate its results.
    asyncio.run(ag02(approved_event_provider))
    print("PHASE_B AG02 PASS")
    for agent in IDS:
        runtime=NodeSocketRuntime(agent,socket_path=sock,signing_secret=signing)
        output=runtime.execute(request(agent))
        review(output)
        for field,expected in (("agent_id",agent),("tenant_id",TENANT),
                              ("client_id",CLIENT),("document_id",DOC)):
            assert output[field]==expected,field+" mismatch"
        print("PHASE_B",agent,"PASS")
    print("PHASE_B PASS six reviewed specialist outputs")

def run_c(signing,sock,writer_url,auditor_url):
    # Valid server-signed workflow context; a deliberately wrong *IPC* HMAC
    # proves the native route denial and invokes dispatcher's failure audit.
    from types import SimpleNamespace
    from Agentic_AI.shared.execution.factory import build_dispatcher
    from Agentic_AI.shared.workflow_context import issue_context
    class SyntheticRouter:
        def build_context_pack(self,**params):
            return SimpleNamespace(tenant_id=params["tenant_id"],
                client_id=params["client_id"],citations=[])
    event_ids=[]
    writer=durable_rejection_audit_callback(writer_url)
    def record(rejection):
        event_ids.append(writer(rejection))
    incorrect=bytearray(signing)
    incorrect[0]^=1
    runtime=NodeSocketRuntime("AG26",socket_path=sock,signing_secret=bytes(incorrect))
    dispatcher=build_dispatcher(signing_secret=signing,router=SyntheticRouter(),
        native_runtimes={"AG26":runtime},audit_failure=record)
    envelope=issue_context(verified_principal="synthetic-staging-runner",
        authorized_tenant=TENANT,authorized_client=CLIENT,
        module_id="intake_triage",document_id=DOC,workflow_id="native-synthetic",
        job_id="tamper-qa",agent_id="AG26",task_type="synthetic",
        signing_secret=signing)
    evidence={"document_id":DOC,"text":"SYNTHETIC ONLY",
              "triage_request":source("AG26")}
    try:
        dispatcher.execute("AG26",envelope=envelope,evidence=evidence,
            expected_tenant=TENANT,expected_client=CLIENT)
    except NativeTransportError:
        pass
    else:
        raise AssertionError("Tampered IPC dispatch must raise NativeTransportError")
    assert len(event_ids)==1, "Exactly one audit callback required"
    event_id=event_ids[0]
    UUID(event_id)
    import psycopg
    with psycopg.connect(auditor_url,connect_timeout=8) as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT event_id::text,agent_id,tenant_id,client_id,error_type
                FROM public.pv_agent_rejection_audit WHERE event_id=%s
            """,(event_id,))
            rows=cursor.fetchall()
            assert len(rows)==1 and rows[0][1:] == (
                "AG26",TENANT,CLIENT,"NativeTransportError"), "audit mismatch"
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema='public' AND table_name='pv_agent_rejection_audit'
            """)
            columns={row[0] for row in cursor.fetchall()}
    assert not columns.intersection({"payload","narrative","patient","source_text",
                                     "clinical_text","prompt","reporter"}), "PII schema detected"
    print("PHASE_C PASS dispatcher tamper rejected; exactly one durable audit UUID="+event_id)

def main(provider=None):
    assert os.environ.get("NEXUS_PV_AGENTS_ENABLED")=="false"
    signing=secret("IPC_SIGNING_SECRET").encode()
    sock=os.environ.get("NEXUS_NATIVE_SOCKET_PATH","/run/nexus-agents/agent.sock")
    assert probe_native_ready(socket_path=sock,signing_secret=signing)
    print("PHASE_A PASS signed readiness")
    if provider is None:
        from .native_local_event_provider import create_local_event_provider
        provider=create_local_event_provider()
    run_b(signing,sock,provider)
    run_c(signing,sock,secret("NEXUS_AUDIT_WRITER_DATABASE_URL"),
          secret("NEXUS_AUDIT_AUDITOR_DATABASE_URL"))
    print("HOSTED_NATIVE_QUALIFICATION PASS A B C")

if __name__=="__main__":
    main()
