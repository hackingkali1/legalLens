import { describe, it, expect } from 'vitest';
import {
  ClauseItemSchema,
  ClauseExtractionResponseSchema,
  DocumentSummaryResponseSchema,
} from '@/lib/validation/clauseSchema';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('Structured AI Output Schemas & Classification', () => {
  it('validates a properly typed clause with allowed categories and attention levels', () => {
    const validClause = {
      category: 'auto-renewal',
      attentionLevel: 'high',
      title: 'Automatic 12-Month Renewal',
      reason: 'Requires strict 60-day notice or locks tenant into another full year',
      plainLanguageExplanation:
        'If you do not give notice 60 days before the lease ends, it automatically renews for another year with a 10% rent hike.',
      sourceSection: 'Section 4 - Automatic Renewal',
      quote: 'Unless either party provides written notice of intent not to renew at least sixty (60) days',
      questionForLawyer: 'Can the 60-day notice window be shortened or made month-to-month?',
    };

    const parsed = ClauseItemSchema.parse(validClause);
    expect(parsed.category).toBe('auto-renewal');
    expect(parsed.attentionLevel).toBe('high');
  });

  it('rejects clauses with invalid categories', () => {
    const invalidClause = {
      category: 'marketing-rights', // not in allowed 8 categories
      attentionLevel: 'medium',
      title: 'Invalid',
      reason: 'test',
      plainLanguageExplanation: 'test',
      sourceSection: 'test',
      quote: 'test',
      questionForLawyer: 'test',
    };

    expect(() => ClauseItemSchema.parse(invalidClause)).toThrow();
  });

  it('rejects clauses with invalid attention levels', () => {
    const invalidAttention = {
      category: 'penalties',
      attentionLevel: 'dangerous', // not low/medium/high
      title: 'Invalid Attention',
      reason: 'test',
      plainLanguageExplanation: 'test',
      sourceSection: 'test',
      quote: 'test',
      questionForLawyer: 'test',
    };

    expect(() => ClauseItemSchema.parse(invalidAttention)).toThrow();
  });

  it('validates a complete document summary response with legal disclaimer', () => {
    const validSummary = {
      overview: 'Residential lease agreement between Apex Property Management and Jane Doe.',
      documentType: 'Residential Lease Agreement',
      mainParties: ['Apex Property Management LLC', 'Jane Doe'],
      effectiveDateOrTerm: '12 months (Nov 1, 2026 - Oct 31, 2027)',
      keyTakeaways: ['Monthly rent $2,400', 'Automatic renewal requires 60-day notice'],
      sectionSummaries: [
        {
          sectionId: 'sec-1',
          plainLanguageSummary: 'Outlines premises and 1-year duration.',
          keyPoints: ['Nov 1 start date'],
        },
      ],
      disclaimer: LEGAL_DISCLAIMER,
    };

    const parsed = DocumentSummaryResponseSchema.parse(validSummary);
    expect(parsed.overview).toBeDefined();
    expect(parsed.disclaimer).toBe(LEGAL_DISCLAIMER);
  });
});

import { extractJsonFromResponse } from '@/lib/ai/nvidia';

describe('extractJsonFromResponse resilience', () => {
  it('extracts JSON surrounded by markdown fences and conversational text', () => {
    const messyOutput = `Here is your analysis:
\`\`\`json
{
  "key": "value",
  "items": [1, 2, 3]
}
\`\`\`
I hope this helps! Feel free to ask more.`;

    const parsed = extractJsonFromResponse<{ key: string; items: number[] }>(messyOutput);
    expect(parsed.key).toBe('value');
    expect(parsed.items.length).toBe(3);
  });

  it('extracts JSON with trailing commas produced by LLMs', () => {
    const trailingCommaOutput = `{
      "name": "Lease",
      "tags": ["rent", "residential",],
    }`;

    const parsed = extractJsonFromResponse<{ name: string; tags: string[] }>(trailingCommaOutput);
    expect(parsed.name).toBe('Lease');
    expect(parsed.tags).toEqual(['rent', 'residential']);
  });
});
