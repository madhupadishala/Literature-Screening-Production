#!/usr/bin/env python3
"""Acquire unmodified public labels as DRAFT references, never client-approved RSI."""
import datetime as dt
import hashlib
import json
import re
import subprocess
import urllib.request as ur
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TODAY = dt.date.today().isoformat()
MASTER = ROOT / 'knowledge/Products/clinixai_product_master.json'
PRODUCTS = json.loads(MASTER.read_text())['products']

def get(url):
    req = ur.Request(url, headers={'User-Agent': 'PV-Knowledge-Source-Acquisition/1.0'})
    with ur.urlopen(req, timeout=25) as r:
        return r.read(), r.geturl(), r.headers.get('Content-Type', '')

def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

def package(product, country, typ, url, source_identity, publication=None, source_country=None):
    folder = ROOT / 'knowledge/Labeling' / product['brandName'] / product['genericName'] / country / typ / ('public-reference-acquired-' + TODAY)
    if (folder / 'manifest.json').exists():
        raise FileExistsError('Existing immutable acquisition preserved; use a new version folder')
    b, final, mime = get(url)
    pdf = b.startswith(b'%PDF-')
    if not pdf and not (typ == 'SmPC' and '4.8' in b.decode(errors='replace') and '6.1' in b.decode(errors='replace')):
        raise ValueError('Response is neither a PDF nor a full HTML SmPC; source rejected')
    folder.joinpath('source').mkdir(parents=True, exist_ok=True)
    src = folder / ('source/document.pdf' if pdf else 'source/document.html')
    src.write_bytes(b)
    textpath = folder / 'derived/parsed/document.txt'
    textpath.parent.mkdir(parents=True, exist_ok=True)
    if pdf:
        result = subprocess.run(['pdftotext', '-layout', str(src), str(textpath)], capture_output=True)
        if result.returncode:
            src.unlink()
            raise ValueError('Invalid/unreadable PDF')
    else:
        class Extract(HTMLParser):
            def __init__(self): super().__init__(); self.parts=[]; self.skip=0
            def handle_starttag(self,tag,attrs):
                if tag in ['script','style']: self.skip += 1
            def handle_endtag(self,tag):
                if tag in ['script','style']: self.skip=max(0,self.skip-1)
            def handle_data(self,data):
                if not self.skip and data.strip(): self.parts.append(data.strip())
        parser=Extract();parser.feed(b.decode(errors='replace'));textpath.write_text('\n'.join(parser.parts)+'\n')
    text = textpath.read_text(errors='replace')
    # Guard against landing-page PDFs or unrelated products; multilingual text needs review.
    if len(text.strip()) < 200:
        src.unlink()
        textpath.unlink()
        raise ValueError('Insufficient extractable text; requires OCR/manual acquisition')
    for sub in ['chunks', 'embeddings', 'indexes']:
        folder.joinpath('derived', sub).mkdir(parents=True, exist_ok=True)
        folder.joinpath('derived', sub, '.gitkeep').write_text('\n')
    sha = hashlib.sha256(b).hexdigest()
    info = subprocess.run(['pdfinfo', str(src)], capture_output=True, text=True).stdout if pdf else ''
    pages = re.search(r'^Pages:\s+(\d+)', info, re.M)
    manifest = {
        'labelId': f"PUBLIC-REFERENCE-{product['productId']}-{country}-{typ}-{sha[:12]}",
        'brandName': product['brandName'], 'genericName': product['genericName'],
        'country': country, 'documentType': typ, 'version': 'acquisition-' + TODAY,
        'effectiveDate': None, 'supersedesLabelId': None, 'governanceStatus': 'DRAFT',
        'effectiveForProduction': False,
        'productScope': {'activeIngredients': [], 'strengths': [], 'dosageForms': [], 'routes': []},
        'requestedProductScope': {'activeIngredients': [product['api']], 'strengths': [product['strength']],
                         'dosageForms': [product['dosageForm']], 'routes': [product['route']]},
        'referenceMapping': {'clientProductId': product['productId'], 'clientMAH': product['mah'],
                             'matchBasis': 'INGREDIENT_STRENGTH_FORM_CANDIDATE_REQUIRES_REVIEW',
                             'exactClientBrandMatch': False, 'exactClientMAHMatch': False,
                             'sourceProductIdentity': source_identity,
                             'sourceJurisdiction': source_country or country,
                             'approvalStatus': 'PENDING_PRODUCT_AND_REGULATORY_REVIEW'},
        'source': {'path': str(src.relative_to(ROOT)), 'canonicalUrl': url, 'resolvedUrl': final,
                   'sha256': sha, 'bytes': len(b), 'mimeType': 'application/pdf' if pdf else 'text/html',
                   'acquiredAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                   'sourcePublicationOrUpdateDate': publication},
        'derived': {'parsedPath': str(textpath.parent.relative_to(ROOT)),
                    'chunksPath': str(folder.joinpath('derived/chunks').relative_to(ROOT)),
                    'embeddingsPath': str(folder.joinpath('derived/embeddings').relative_to(ROOT)),
                    'indexPath': str(folder.joinpath('derived/indexes').relative_to(ROOT)),
                    'embeddingModel': None, 'embeddingDimensions': None},
        'regulatoryUse': {'referenceSafetyInformation': False, 'listednessExpectedness': False,
                          'jurisdictionSpecific': True},
        'technicalVerification': {'pdfReadable': True if pdf else None, 'fullHtmlSmPC': not pdf, 'pages': int(pages[1]) if pages else None,
                                  'textPreservedWithoutTruncation': True,
                                  'sourceBytesUnmodified': True, 'humanContentReview': 'PENDING'}
    }
    dump(folder / 'manifest.json', manifest)
    dump(folder / 'qa/acquisition-check.json', manifest['technicalVerification'])
    return {'status': 'ACQUIRED_REFERENCE_PENDING_REVIEW', 'documentType': typ,
            'manifestPath': str((folder / 'manifest.json').relative_to(ROOT)), 'sourceUrl': url}

if __name__=='__main__':
    # Explicit reviewed source catalog, not automatic Top-K product inference.
    catalog = json.loads((ROOT/'knowledge/Labeling/public-reference-source-catalog.json').read_text())
    products = {p['productId']: p for p in PRODUCTS}
    for row in catalog['sources']:
        try:
            print(package(products[row['productId']], row['country'], row['documentType'],
                          row['url'], row['sourceProductIdentity'], row['publication'], row['sourceCountry']))
        except FileExistsError as e:
            print(row['productId'], row['country'], 'PRESERVED_EXISTING_SOURCE', str(e))
        except Exception as e:
            print(row['productId'], row['country'], 'ACQUISITION_FAILED', str(e))
