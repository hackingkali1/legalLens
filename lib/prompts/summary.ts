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

export const BATCH_SECTION_SUMMARY_PROMPT = (sectionsText: string) => `
CRITICAL INSTRUCTION: Respond with ONLY a single valid JSON object containing section summaries for the provided sections. Do NOT include markdown code fences (no \`\`\`json or \`\`\`), no introductory explanations, no chain-of-thought or thinking process, and no trailing commentary.

ONE-SHOT EXAMPLE OF EXPECTED OUTPUT:
{
  "sectionSummaries": [
    {
      "sectionId": "sec-1",
      "plainLanguageSummary": "Defines the scope of IT infrastructure services provided.",
      "keyPoints": [
        "Network maintenance included",
        "Hardware replacement billed separately"
      ]
    }
  ]
}

Strict requirements:
- Output ONLY the JSON object.
- Provide a concise, clear plain-language summary and 2-4 key bullet points for each section.
- Ground all explanations strictly in the section text provided.

DOCUMENT SECTIONS TO ANALYZE:
${sectionsText}
`;

export const DOCUMENT_OVERVIEW_SYNTHESIS_PROMPT = (summariesText: string, initialContext?: string) => `
CRITICAL INSTRUCTION: Respond with ONLY a single valid JSON object. Synthesize the high-level executive overview, document type, main parties, effective term, and key takeaways based on the section summaries and preamble provided below. Do NOT include markdown code fences (no \`\`\`json or \`\`\`), no introductory explanations, no chain-of-thought or thinking process, and no trailing commentary.

ONE-SHOT EXAMPLE OF EXPECTED OUTPUT:
{
  "overview": "This document is a commercial lease agreement between Apex Property Management LLC and Jane Doe for 742 Evergreen Terrace.",
  "documentType": "Residential Lease Agreement",
  "mainParties": ["Apex Property Management LLC (Landlord)", "Jane Doe (Tenant)"],
  "effectiveDateOrTerm": "November 1, 2026 to October 31, 2027 (12 months)",
  "keyTakeaways": [
    "Monthly rent is $2,400 with a $150 late penalty after the 5th.",
    "Security deposit of $2,400 refundable within 30 days.",
    "Lease automatically renews for 12 months with a 10% rent increase unless 60-day notice is given."
  ],
  "disclaimer": "${LEGAL_DISCLAIMER}"
}

Strict requirements:
- Output ONLY the JSON object.
- Synthesize an accurate, high-level summary.
- Identify parties, term/dates, and top 3-5 critical takeaways.

${initialContext ? `PREAMBLE / OPENING RECITALS:\n${initialContext}\n\n` : ''}SECTION SUMMARIES:
${summariesText}
`;

