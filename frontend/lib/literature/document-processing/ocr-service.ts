import { pdfProcessor } from "./pdf-processor";

import type {
  DocumentProcessingStatus,
  PDFProcessingRequest,
  PDFProcessingResult,
} from "./document-processing-types";

class OCRService {
  private history: PDFProcessingResult[] = [];

  async process(request: PDFProcessingRequest) {
    const result = await pdfProcessor.process(request);

    this.history.unshift(result);

    return result;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): DocumentProcessingStatus {
    const processedDocuments = this.history.length;

    const averageOCRConfidence =
      processedDocuments === 0
        ? 0
        : Number(
            (
              this.history.reduce(
                (sum, item) => sum + item.ocr.confidence,
                0,
              ) / processedDocuments
            ).toFixed(2),
          );

    return {
      processedDocuments,
      averageOCRConfidence,
    };
  }
}

export const ocrService = new OCRService();