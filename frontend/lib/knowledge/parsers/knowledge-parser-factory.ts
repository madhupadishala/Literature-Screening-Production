import "server-only";

import { csvKnowledgeParser } from "./csv-knowledge-parser";
import { docxKnowledgeParser } from "./docx-knowledge-parser";
import { htmlKnowledgeParser } from "./html-knowledge-parser";
import { jsonKnowledgeParser } from "./json-knowledge-parser";
import { markdownKnowledgeParser } from "./markdown-knowledge-parser";
import { pdfKnowledgeParser } from "./pdf-knowledge-parser";
import { textKnowledgeParser } from "./text-knowledge-parser";
import { xlsxKnowledgeParser } from "./xlsx-knowledge-parser";
import { xmlKnowledgeParser } from "./xml-knowledge-parser";

import type { KnowledgeParser } from "./knowledge-parser";

import {
  KnowledgeParserError,
  type KnowledgeParserInput,
} from "./parser-types";

class KnowledgeParserFactory {
  private readonly parsers: KnowledgeParser[] = [
    pdfKnowledgeParser,
    docxKnowledgeParser,
    htmlKnowledgeParser,
    xmlKnowledgeParser,
    markdownKnowledgeParser,
    jsonKnowledgeParser,
    csvKnowledgeParser,
    xlsxKnowledgeParser,
    textKnowledgeParser,
  ];

  register(parser: KnowledgeParser) {
    const duplicateIndex = this.parsers.findIndex(
      (existing) =>
        existing.name === parser.name,
    );

    if (duplicateIndex >= 0) {
      this.parsers[duplicateIndex] = parser;
    } else {
      this.parsers.push(parser);
    }

    return parser;
  }

  resolve(extension: string) {
    const normalizedExtension =
      extension.trim().toLowerCase();

    return (
      this.parsers.find((parser) =>
        parser.supports(normalizedExtension),
      ) ?? null
    );
  }

  supports(extension: string) {
    return this.resolve(extension) !== null;
  }

  async parse(input: KnowledgeParserInput) {
    const parser = this.resolve(input.extension);

    if (!parser) {
      throw new KnowledgeParserError(
        `No knowledge parser is registered for ${
          input.extension || "(no extension)"
        }.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    return parser.parse(input);
  }

  listRegisteredParsers() {
    return this.parsers.map((parser) => ({
      name: parser.name,
      version: parser.version,
      extensions: [...parser.support.extensions],
      formats: [...parser.support.formats],
    }));
  }

  listSupportedExtensions() {
    return Array.from(
      new Set(
        this.parsers.flatMap(
          (parser) =>
            parser.support.extensions,
        ),
      ),
    ).sort();
  }
}

export const knowledgeParserFactory =
  new KnowledgeParserFactory();