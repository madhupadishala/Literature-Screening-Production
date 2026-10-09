from nexus_agents.day_zero.agent import *
from nexus_agents.reporter.agent import ReporterAgent, qualify
from nexus_agents.patient.agent import PatientAgent
from nexus_agents.current.agent import run_both
from nexus_agents.common import pdate

class Stub:
    def __init__(self, out): self.out = out
    def complete_json(self, **k): return self.out

def crit(ok, ev=None): return {"present": ok, "evidence": ev}

def test_day_zero_assembled_across_contacts():
    t1 = "Nurse Rao called: patient on DrugX developed rash."
    t2 = "Follow-up: patient is a 54 year old female."
    llm = Stub({"events":[
      {"event_id":"e1","reporter":crit(True,"Nurse Rao"),"patient":crit(False),"product":crit(True,"DrugX"),"reaction":crit(True,"developed rash")},
      {"event_id":"e2","reporter":crit(False),"patient":crit(True,"54 year old female"),"product":crit(False),"reaction":crit(False),"is_followup_significant":False}]})
    inp = DayZeroInput(case_id="c1", source_type=SourceType.spontaneous, seriousness=True,
        receipts=[Receipt(event_id="e1",date="2026-10-01",text=t1),Receipt(event_id="e2",date="2026-10-04",text=t2)])
    r = DayZeroAgent(llm).run(inp)
    assert r.valid_icsr and r.day_zero == "2026-10-04" and r.applicable_due_date == "2026-10-19"

def test_day_zero_invalid_when_missing():
    llm = Stub({"events":[{"event_id":"e1","reporter":crit(False),"patient":crit(True,"54 year old"),"product":crit(True,"DrugX"),"reaction":crit(True,"rash")}]})
    inp = DayZeroInput(case_id="c", source_type=SourceType.spontaneous, receipts=[Receipt(event_id="e1",date="2026-10-01",text="54 year old on DrugX had rash")])
    r = DayZeroAgent(llm).run(inp)
    assert not r.valid_icsr and r.day_zero is None and "reporter" in r.missing_criteria

def test_day_zero_ungrounded_evidence_ignored():
    llm = Stub({"events":[{"event_id":"e1","reporter":crit(True,"Dr Invented"),"patient":crit(True,"54 year old"),"product":crit(True,"DrugX"),"reaction":crit(True,"rash")}]})
    inp = DayZeroInput(case_id="c", source_type=SourceType.spontaneous, receipts=[Receipt(event_id="e1",date="2026-10-01",text="54 year old on DrugX had rash")])
    assert not DayZeroAgent(llm).run(inp).valid_icsr

def test_literature_abstract_uses_search_date():
    txt="Dr A reported a 60 year old man on DrugX with hepatitis."
    llm = Stub({"events":[{"event_id":"e1","reporter":crit(True,"Dr A"),"patient":crit(True,"60 year old man"),"product":crit(True,"DrugX"),"reaction":crit(True,"hepatitis"),"in_abstract_only":True}]})
    inp = DayZeroInput(case_id="c", source_type=SourceType.literature_global, search_date="2026-10-05", receipts=[Receipt(event_id="e1",date="2026-10-08",text=txt)])
    assert DayZeroAgent(llm).run(inp).day_zero == "2026-10-05"

def test_reporter_qualification_and_primary():
    src="Reported by her mother, Sunita K., and treating neurologist Dr Ravi Rao, Apollo Hospital, Hyderabad, India."
    llm=Stub({"reporters":[{"family_name":"K.","given_name":"Sunita","occupation_as_stated":"mother","is_patient_or_relative":True,"evidence":"her mother, Sunita K."},
      {"given_name":"Ravi","family_name":"Rao","organisation":"Apollo Hospital","city":"Hyderabad","country":"India","occupation_as_stated":"treating neurologist","evidence":"Dr Ravi Rao, Apollo Hospital, Hyderabad, India"}]})
    r=ReporterAgent(llm).run(src)
    assert [x.qualification_code for x in r.reporters]==[5,1] and r.reporters[1].primary_source_for_regulatory_purposes and r.reporters[1].country_iso2=="IN"

def test_qualify_edge():
    assert qualify("pharmacist")==2 and qualify("attorney")==4 and qualify("staff nurse")==3 and qualify("astronaut") is None

def test_patient_units_and_flags():
    src="A 30-year-old woman, 154 lb, 5 in? no. Weight 154 lb, height 170 cm."
    llm=Stub({"sex_as_stated":"woman","sex_evidence":"woman","age_at_onset":{"value":30,"unit":"years","evidence":"30-year-old"},
              "weight":{"value":154,"unit":"lb","evidence":"Weight 154 lb"},"height":{"value":170,"unit":"cm","evidence":"height 170 cm"}})
    p=PatientAgent(llm).run(src).patient
    assert p.sex_code==2 and p.age_at_onset_ucum=="a" and p.weight_kg==69.85 and p.age_group_derived_code==6 and p.age_group_reported_code is None

def test_history_vs_current_partition():
    src=("Patient has had hypertension since 2015 and takes amlodipine. History of appendectomy in 2009. "
         "Took metformin until 2018. Rash began 2026-09-20; she was given cetirizine for the rash.")
    C=lambda t,k,**kw:{"term_as_reported":t,"kind":k,"evidence":t if "evidence" not in kw else kw.pop("evidence"),**kw}
    llm=Stub({"reaction_onset_date":"2026-09-20","reaction_onset_evidence":"Rash began 2026-09-20",
      "conditions":[C("hypertension","condition",start_date="2015",temporal_phrase="has had",continuing_stated="yes"),
                    C("appendectomy","surgery_procedure",start_date="2009",temporal_phrase="History of")],
      "drugs":[{"name_as_reported":"amlodipine","temporal_phrase":"takes","evidence":"takes amlodipine"},
               {"name_as_reported":"metformin","end_date":"2018","evidence":"Took metformin until 2018"},
               {"name_as_reported":"cetirizine","stated_role":"treatment_of_event","evidence":"given cetirizine for the rash"}]})
    h,c=run_both(llm,src)
    assert [i.payload["term_as_reported"] for i in c.conditions]==["hypertension"]
    assert [i.payload["term_as_reported"] for i in h.conditions]==["appendectomy"]
    assert [i.payload["name_as_reported"] for i in c.drugs]==["amlodipine"]
    assert [i.payload["name_as_reported"] for i in h.drugs]==["metformin"]
    assert c.excluded_treatment_of_event[0]["name_as_reported"]=="cetirizine"

def test_pdate():
    assert pdate.before("2018","2026-09-20") is True and pdate.before("2026-09","2026-09-20") is None
