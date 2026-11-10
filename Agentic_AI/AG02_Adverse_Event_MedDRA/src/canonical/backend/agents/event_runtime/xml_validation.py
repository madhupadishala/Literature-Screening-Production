"""Pinned offline schema validation. No document-controlled schema downloads."""
import json
from hashlib import sha256
from pathlib import Path
from lxml import etree

class SchemaBundle:
    def __init__(self, directory, manifest_file):
        root=Path(directory).resolve()
        manifest=json.loads(Path(manifest_file).read_text())
        if manifest.get('approved') is not True or not manifest.get('version'):
            raise ValueError('Controlled approved schema manifest required')
        allowed={}
        for relative,digest in manifest['sha256'].items():
            path=(root/relative).resolve()
            if not path.is_relative_to(root) or sha256(path.read_bytes()).hexdigest()!=digest:
                raise ValueError('Schema bundle checksum/path mismatch')
            allowed[str(path)]=path
        entry=str((root/manifest['entrypoint']).resolve())
        if entry not in allowed:raise ValueError('Entrypoint not pinned')
        class Resolver(etree.Resolver):
            def resolve(self,url,pubid,context):
                path=str(Path(url).resolve())
                if path not in allowed:raise ValueError('Unpinned schema dependency')
                return self.resolve_filename(path,context)
        parser=etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False)
        parser.resolvers.add(Resolver())
        self.schema=etree.XMLSchema(etree.parse(entry,parser))
        self.version=manifest['version']
    def validate(self, raw):
        if b'<!ENTITY' in raw.upper():raise ValueError('XML entities forbidden')
        xml=etree.fromstring(raw,etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
        self.schema.assertValid(xml)
        return {'schema_validated':True,'schema_version':self.version,
                'regional_business_rules_validated':False}
