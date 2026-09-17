import { LEGAL_DISCLAIMER } from '../constants';

export const DOCUMENT_QA_PROMPT = (question: string, contextChunksText: string) => `
You are answering a user question about an uploaded legal document.

DOCUMENT CONTEXT (RELEVANT SECTIONS):
${contextChunksText}

USER QUESTION:
"${question}"

RULES:
1. Base your answer EXCLUSIVELY on the provided document context.
2. If the answer is NOT present or cannot be reasonably deduced from the provided context, you MUST set "isOutOfScope": true, "answer": "I couldn't find that information in the uploaded document.", and "citations": [].
3. If the user asks a general legal question that does not relate to the terms of this document, you MUST refuse and set "isOutOfScope": true and "answer": "I couldn't find that information in the uploaded document."
4. Every substantive statement in your answer MUST be supported by at least one citation to a provided section.
5. In every citation, the quote MUST be a verbatim or near-verbatim excerpt from the context.
6. Do NOT give legal advice. Never state whether the user should sign, sue, or settle.
7. Return ONLY a valid JSON object matching this schema:

{
  "answer": "Plain-language direct answer supported by the text.",
  "citations": [
    {
      "sectionTitle": "Exact section title from context",
      "quote": "Direct verbatim quote from context",
      "relevanceExplanation": "Short explanation of how this excerpt answers the question"
    }
  ],
  "isOutOfScope": false,
  "disclaimer": "${LEGAL_DISCLAIMER}"
}
`;
