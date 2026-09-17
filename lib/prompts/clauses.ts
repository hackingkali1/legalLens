export const CLAUSE_DETECTION_PROMPT = (documentText: string) => `
CRITICAL INSTRUCTION: Respond with ONLY a single valid JSON object. Do NOT include markdown code fences (no \`\`\`json or \`\`\`), no introductory explanations, no chain-of-thought or thinking process, and no trailing commentary.

Analyze the provided legal document and extract all important clauses across these 8 specific categories:
1. obligations (mandatory duties, reporting, or performance requirements)
2. deadlines (specific timeframes, cutoffs, response windows)
3. penalties (late fees, liquidated damages, default charges, forfeitures)
4. auto-renewal (automatic extension, rollover periods, opt-out notice windows)
5. liability (caps on damages, exclusions, limitation of liability)
6. indemnity (hold-harmless clauses, duty to defend, indemnification)
7. termination (for cause, for convenience, notice periods, post-termination restrictions)
8. other (governing law, dispute resolution, non-solicitation, confidentiality)

For attentionLevel, classify strictly as:
- "low": standard, mutual, balanced, or customary provision
- "medium": creates asymmetry, strict timelines, or conditional financial risk
- "high": creates severe exposure, unilateral termination, unlimited indemnity, tight forfeiture, or automatic long-term renewal

ONE-SHOT EXAMPLE OF EXPECTED OUTPUT:
{
  "clauses": [
    {
      "category": "auto-renewal",
      "attentionLevel": "high",
      "title": "Automatic 12-Month Renewal",
      "reason": "Requires written notice 60 days in advance or locks party into another full year.",
      "plainLanguageExplanation": "If you fail to give notice 60 days before the term ends, this agreement automatically extends for another 12 months.",
      "sourceSection": "Section 4 - Term and Renewal",
      "quote": "Unless either party provides written notice at least sixty (60) days prior to the expiration date, this agreement shall automatically renew for additional one-year terms.",
      "questionForLawyer": "Can we reduce the required notice window to 30 days or allow month-to-month continuation?"
    }
  ]
}

STRICT REQUIREMENTS:
- Output ONLY valid JSON matching the schema above.
- Quotes MUST be verbatim excerpts from the provided text.
- Do NOT declare clauses as 'illegal' or 'dangerous'; use neutral phrasing: 'Requires careful review because...'
- Extract between 4 and 15 meaningful clauses that are most relevant to understanding commitments and risk.

DOCUMENT TEXT:
${documentText}
`;
