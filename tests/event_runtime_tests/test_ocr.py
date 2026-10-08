from pathlib import Path
from backend.agents.event_runtime.ocr import LocalOCR
from backend.agents.event_runtime.ingestion import unpack
from .test_agent import doc

def test_actual_tesseract_scanned_pdf():
    source=Path(__file__).parent/'fixtures/ocr-scan.pdf'
    blocks=unpack(doc(source.read_bytes(),media_type='application/pdf'),LocalOCR())
    assert 'developed nausea after treatment' in blocks[0].text
    # OCR may confuse zero and letter O: preserve output and require visual review.
    assert 'No rash was reported' in blocks[0].text
    assert blocks[0].ingestion_metadata['engine']=='tesseract'
    assert blocks[0].ingestion_metadata['word_boxes']
    assert blocks[0].ingestion_metadata['review_required'] is True
