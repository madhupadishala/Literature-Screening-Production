"""Local OCR: subprocesses without shell execution or document-controlled arguments."""
import csv
import io
import subprocess
import tempfile
from pathlib import Path

class OCRError(ValueError): pass

class LocalOCR:
    def __init__(self, language='eng', dpi=200, minimum_confidence=70):
        if language not in ('eng',):
            raise ValueError('Only English OCR is qualified by the current software tests')
        self.language,self.dpi,self.minimum_confidence=language,dpi,minimum_confidence
    def pdf_page(self, raw, number):
        with tempfile.TemporaryDirectory(prefix='ae-ocr-') as folder:
            source=Path(folder)/'source.pdf';source.write_bytes(raw)
            target=Path(folder)/'page'
            subprocess.run(['pdftoppm','-f',str(number),'-l',str(number),'-r',str(self.dpi),'-singlefile','-png',str(source),str(target)],check=True,timeout=45,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            return self.image(target.with_suffix('.png'))
    def image(self, path):
        result=subprocess.run(['tesseract',str(path),'stdout','-l',self.language,'tsv'],check=True,timeout=45,capture_output=True,text=True)
        rows=list(csv.DictReader(io.StringIO(result.stdout),delimiter='\t'))
        words=[r for r in rows if r.get('text','').strip() and float(r.get('conf','-1')) >= 0]
        if not words:raise OCRError('no readable OCR text')
        confidence=sum(float(r['conf']) for r in words)/len(words)
        lines={}
        boxes=[]
        for r in words:
            key=(r['page_num'],r['block_num'],r['par_num'],r['line_num'])
            lines.setdefault(key,[]).append(r['text'])
            boxes.append({k:r[k] for k in ('text','left','top','width','height','conf')})
        text='\n'.join(' '.join(words) for words in lines.values())
        return text,{'engine':'tesseract','language':self.language,'mean_word_confidence':confidence,
                     'low_confidence':confidence<self.minimum_confidence,'word_boxes':boxes,
                     'review_required':True}
