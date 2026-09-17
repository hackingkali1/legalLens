import { LEGAL_DISCLAIMER } from '../constants';

export const DOCUMENT_COMPARE_PROMPT = (docAName: string, docAText: string, docBName: string, docBText: string) => `
You are comparing two versions of a legal document (Document A: "${docAName}" vs Document B: "${docBName}").

DOCUMENT A ("${docAName}") EXCERPT:
${docAText}

DOCUMENT B ("${docBName}") EXCERPT:
${docBText}

TASK:
Identify and explain all MATERIAL changes between Document A and Document B in plain English.
Focus on substantive shifts in rights, financial terms, deadlines, liabilities, indemnities, obligations, or termination conditions.

STRICT GUARDRAILS:
- Do NOT make any recommendation about which version the user should choose, sign, or accept.
- Do NOT describe either version as "better" or "worse". Frame changes neutrally (e.g. "Document B shortens the notice window from 30 days to 14 days and introduces a 5% penalty").
- For each change, provide the section reference and quote from Doc A and/or Doc B.

Return ONLY a valid JSON object matching this schema:
{
  "summaryOverview": "High-level neutral overview of the primary differences between the two documents.",
  "materialChanges": [
    {
      "title": "Short descriptive title of the change (e.g., Shortened Payment Notice)",
      "type": "added" | "removed" | "modified",
      "attentionLevel": "low" | "medium" | "high",
      "plainLanguageExplanation": "Plain English explanation of what this change means in practice.",
      "sourceDocA": {
        "sectionTitle": "Section name in Doc A, or 'Not present in Doc A'",
        "quote": "Quote from Doc A, or ''"
      },
      "sourceDocB": {
        "sectionTitle": "Section name in Doc B, or 'Not present in Doc B'",
        "quote": "Quote from Doc B, or ''"
      }
    }
  ],
  "disclaimer": "${LEGAL_DISCLAIMER}"
}
`;
