import { LEGAL_DISCLAIMER } from '../constants';

export const DOCUMENT_SUMMARY_PROMPT = (sectionsText: string) => `
CRITICAL INSTRUCTION: Respond with ONLY a single valid JSON object. Do NOT include markdown code fences (no \`\`\`json or \`\`\`), no introductory explanations, no chain-of-thought or thinking process, and no trailing commentary.

ONE-SHOT EXAMPLE OF EXPECTED OUTPUT:
{
  "overview": "This document is a commercial service agreement between Provider Inc. and Client LLC outlining managed IT services.",
  "documentType": "Service Agreement",
  "mainParties": ["Provider Inc.", "Client LLC"],
  "effectiveDateOrTerm": "12 months starting January 1, 2026",
  "keyTakeaways": [
    "Monthly fee is $3,000 payable within 30 days.",
    "Services include 24/7 server monitoring.",
    "Either party may terminate with 30 days written notice."
  ],
  "sectionSummaries": [
    {
      "sectionId": "sec-1",
      "plainLanguageSummary": "Defines the scope of IT infrastructure services provided.",
      "keyPoints": [
        "Network maintenance included",
        "Hardware replacement billed separately"
      ]
    }
  ],
  "disclaimer": "${LEGAL_DISCLAIMER}"
}

Strict requirements:
- Output ONLY the JSON object.
- Do NOT provide legal advice.
- All points must be grounded directly in the provided text.

DOCUMENT SECTIONS TO ANALYZE:
${sectionsText}
`;
