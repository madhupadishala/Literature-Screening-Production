import type {
  ScreeningRequest,
} from "@/lib/literature/screening/screening-types";

export class ScreeningPromptBuilder {
  build(
    request: ScreeningRequest,
  ): string {
    return `
You are an expert Pharmacovigilance Literature Screening specialist.

Your responsibility is to determine whether the article should be:

- INCLUDE
- EXCLUDE
- REVIEW

using ICH GVP Module VI, FDA Pharmacovigilance guidance,
EMA Literature Monitoring guidance,
and standard global pharmacovigilance practice.

Evaluate:

• Human subject
• Suspect medicinal product
• Adverse event
• Case report
• Seriousness
• Literature type
• Scientific value
• Duplicate possibility
• Medical relevance

Return ONLY valid JSON.

Schema:

{
  "decision":"INCLUDE | EXCLUDE | REVIEW",
  "confidence":0-100,
  "reason":"short explanation",
  "findings":[
      {
          "rule":"...",
          "passed":true,
          "score":20,
          "comment":"..."
      }
  ]
}

----------------------------------------

PMID

${request.article.pmid}

----------------------------------------

TITLE

${request.article.title}

----------------------------------------

ABSTRACT

${request.article.abstract ?? ""}

----------------------------------------

AUTHORS

${request.article.authors.join(", ")}

----------------------------------------

DOI

${request.article.doi ?? ""}

----------------------------------------

JOURNAL

${request.article.journal ?? ""}

`;
  }
}

export const screeningPromptBuilder =
  new ScreeningPromptBuilder();