"""Version-aware E2B reaction mapping. Import mapping is not submission validation.
R3 paths/OIDs checked against FDA July 2024 example instances.
R2 fields follow ICH ICSR DTD v2.1. Do not decode MedDRA without licensed version data.
"""
from hashlib import sha256
from lxml import etree

HL7='urn:hl7-org:v3'
NS={'h':HL7}
OBS_OID='2.16.840.1.113883.3.989.2.1.1.19'
MEDDRA_OID='2.16.840.1.113883.6.163'

def parse(raw, document_id, schema_bundle=None):
    if len(raw)>10_000_000 or b'<!ENTITY' in raw.upper():raise ValueError('XML entity/size violation')
    root=etree.fromstring(raw,etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False,huge_tree=False))
    tree=root.getroottree()
    records,narratives=[],[]
    if root.tag in ('ichicsr','safetyreport'):
        version='R2'
        reports=[root] if root.tag=='safetyreport' else root.findall('safetyreport')
        if not reports:raise ValueError('no R2 safety reports')
        for report_index,report in enumerate(reports):
            case=report.findtext('safetyreportid')
            if not case:raise ValueError('R2 report ID missing')
            patients=report.findall('patient')
            if len(patients)!=1:raise ValueError('R2 report patient boundary ambiguous')
            patient=patients[0]
            identity=f'{document_id}:report:{report_index}:{case}:index-patient'
            for reaction in patient.findall('reaction'):
                values={c.tag:{'text':c.text,'attributes':dict(c.attrib)} for c in reaction}
                records.append(record(document_id,case,identity,version,tree,reaction,values))
            for node in patient.findall('./summary/narrativeincludeclinical'):
                if node.text and node.text.strip():narratives.append((tree.getpath(node),node.text))
    elif root.tag.startswith('{'+HL7+'}'):
        version='R3'
        investigations=root.xpath('.//h:investigationEvent',namespaces=NS)
        if not investigations:raise ValueError('no R3 investigation event')
        for report_index,report in enumerate(investigations):
            ids=report.xpath('./h:id[@root="2.16.840.1.113883.3.989.2.1.3.1"]/@extension',namespaces=NS)
            if len(ids)!=1 or not ids[0]:raise ValueError('R3 case identifier ambiguous')
            case=ids[0]
            assessments=report.xpath('./h:component/h:adverseEventAssessment',namespaces=NS)
            if len(assessments)!=1:raise ValueError('R3 patient assessment boundary ambiguous')
            assessment=assessments[0]
            patients=assessment.xpath('./h:subject1/h:primaryRole',namespaces=NS)
            if len(patients)!=1:raise ValueError('R3 index patient boundary ambiguous')
            identity=f'{document_id}:report:{report_index}:{case}:index-patient'
            reactions=assessment.xpath('.//h:observation[h:code[@code="29" and @codeSystem="'+OBS_OID+'"]]',namespaces=NS)
            for reaction in reactions:
                values={}
                value=reaction.find('{'+HL7+'}value')
                if value is not None:
                    values['E.i.2.1']={'attributes':dict(value.attrib),'text':value.text}
                    originals=value.findall('{'+HL7+'}originalText')
                    if originals:values['E.i.1.1a']={'text':''.join(originals[0].itertext()),'attributes':dict(originals[0].attrib)}
                time=reaction.find('{'+HL7+'}effectiveTime')
                if time is not None:
                    values['E.i.4_E.i.5']={'xml':etree.tostring(time,encoding='unicode')}
                # Immediate reaction sub-observations only: do not import indications/labs.
                for sub in reaction.xpath('./h:outboundRelationship2/h:observation',namespaces=NS):
                    code=sub.find('{'+HL7+'}code'); val=sub.find('{'+HL7+'}value')
                    if code is not None and val is not None:
                        field=code.get('codeSystem','')+':'+code.get('code','')
                        if field in values:raise ValueError('duplicate reaction attribute')
                        values[field]={'attributes':dict(val.attrib),'text':''.join(val.itertext()),'xml_path':tree.getpath(val)}
                records.append(record(document_id,case,identity,version,tree,reaction,values))
            for node in report.xpath('./h:text',namespaces=NS):
                text=''.join(node.itertext())
                if text.strip():narratives.append((tree.getpath(node),text))
    else:
        raise ValueError('unsupported XML format; not an E2B ICSR')
    validation = schema_bundle.validate(raw) if schema_bundle else {'schema_validated':False}
    return {'version':version,'records':records,'narratives':narratives,**validation,
            'mapping_version':'e2b-event-0.2.0','review_required':True,
            'attachments_require_ingestion': bool(root.xpath('.//h:reference',namespaces=NS))}

def record(document_id,case,patient,version,tree,node,values):
    xml=etree.tostring(node,encoding='unicode',with_tail=False)
    return {'id':sha256((document_id+tree.getpath(node)).encode()).hexdigest()[:24],
            'document_id':document_id,'case_id':case,'patient_id':patient,'format':version,
            'xml_path':tree.getpath(node),'source_xml':xml,'source_xml_sha256':sha256(xml.encode()).hexdigest(),
            'reported_fields':values,'review_required':True,'coding_approved':False}
