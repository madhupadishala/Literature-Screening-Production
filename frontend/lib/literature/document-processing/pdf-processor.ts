import type {
  PDFProcessingRequest,
  PDFProcessingResult,
} from "./document-processing-types";

export class PDFProcessor {
  async process(
    request: PDFProcessingRequest,
  ): Promise<PDFProcessingResult> {
    return {
      pmid: request.pmid,
      fileName: request.fileName,
      pageCount: 5,
      ocr: {
        extractedText:
          "Mock PDF extraction for Production Alpha.",
        confidence: 98.5,
      },
      processedAt: new Date().toISOString(),
    };
  }
}

export const pdfProcessor = new PDFProcessor();