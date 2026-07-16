export interface PDFProcessingRequest {
  tenantId: string;
  pmid: string;
  fileName: string;
}

export interface OCRResult {
  extractedText: string;
  confidence: number;
}

export interface PDFProcessingResult {
  pmid: string;
  fileName: string;
  pageCount: number;
  ocr: OCRResult;
  processedAt: string;
}

export interface DocumentProcessingStatus {
  processedDocuments: number;
  averageOCRConfidence: number;
}