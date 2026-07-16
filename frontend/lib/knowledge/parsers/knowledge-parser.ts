import "server-only";

import type {
  KnowledgeParserInput,
  KnowledgeParserSupport,
  ParsedKnowledgeDocument,
} from "./parser-types";

export interface KnowledgeParser {
  readonly name: string;
  readonly version: string;
  readonly support: KnowledgeParserSupport;

  supports(extension: string): boolean;

  parse(input: KnowledgeParserInput): Promise<ParsedKnowledgeDocument>;
}

export abstract class BaseKnowledgeParser implements KnowledgeParser {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly support: KnowledgeParserSupport;

  supports(extension: string): boolean {
    const normalizedExtension = extension.trim().toLowerCase();

    return this.support.extensions.some(
      (supportedExtension) =>
        supportedExtension.toLowerCase() === normalizedExtension,
    );
  }

  abstract parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument>;
}