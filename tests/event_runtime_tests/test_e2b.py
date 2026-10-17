from pathlib import Path
from zipfile import ZipFile

def fixture(name):
    with ZipFile(Path(__file__).parent/"fixtures/fda/official-reaction-fixtures.zip") as z:
        return z.read(name+".xml")
import pytest
from backend.agents.event_runtime.e2b import parse
from backend.agents.event_runtime.engine import EventEngine
from .test_agent import ScriptedProvider, request, run

EXPECTED={"000":["10027940","10009896"],"001":["10027940","10009896"],"002":["10027940","10009896"],"003":["10027940","10009896"],"004":["10020321","10027940","10009896"],"005":["10020321","10027940","10009896"],"006":["10027940","10009896"],"007":["10060051","10036960","10036960","10067994","10050987","10027940","10024381"],"008":["10000001"],"009":["10027940","10009896"]}

@pytest.mark.parametrize("name",sorted(EXPECTED))
def test_official_fda_reaction_codes(name):
    raw=fixture(name)
    out=parse(raw,name)
    assert [r["reported_fields"]["E.i.2.1"]["attributes"]["code"] for r in out["records"]]==EXPECTED[name]
    assert out["schema_validated"] is False
    assert all(r["source_xml_sha256"] and r["xml_path"] for r in out["records"])
    assert all(r["patient_id"].startswith(name+":report:") for r in out["records"])

def test_r2_repeating_reactions_and_reports():
    raw=b'<ichicsr><safetyreport><safetyreportid>A</safetyreportid><patient><reaction><primarysourcereaction>nausea</primarysourcereaction></reaction><reaction><reactionmeddrapt>Headache</reactionmeddrapt></reaction></patient></safetyreport><safetyreport><safetyreportid>B</safetyreportid><patient><reaction><primarysourcereaction>rash</primarysourcereaction></reaction></patient></safetyreport></ichicsr>'
    out=parse(raw,'doc')
    assert len(out['records'])==3
    assert out['records'][0]['patient_id']!=out['records'][2]['patient_id']

def test_engine_keeps_structured_records_without_llm_coding():
    raw=fixture('000')
    out=run(request(raw,media_type='application/xml'))
    assert len(out.structured_records)==2
    assert out.status=='incomplete' # regional schema validation still pending

@pytest.mark.parametrize('raw',[b'<safetyreport><patient/></safetyreport>',b'<wrong/>',b'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>'])
def test_invalid_or_unsupported_e2b_rejected(raw):
    with pytest.raises(ValueError):parse(raw,'d')
