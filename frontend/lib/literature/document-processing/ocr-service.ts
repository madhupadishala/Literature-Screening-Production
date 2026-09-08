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

  list(tenantId: string, limit = 20) {
    return this.history
      .filter((item) => item.tenantId === tenantId)
      .slice(0, limit);
  }

  getStatus(tenantId: string): DocumentProcessingStatus {
    const tenantHistory = this.history.filter(
      (item) => item.tenantId === tenantId,
    );
    const processedDocuments = tenantHistory.length;

    const averageOCRConfidence =
      processedDocuments === 0
        ? 0
        : Number(
            (
              tenantHistory.reduce(
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