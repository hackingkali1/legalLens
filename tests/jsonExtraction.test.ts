import { describe, it, expect } from 'vitest';
import { extractJsonFromResponse, sanitizeJsonString } from '@/lib/ai/nvidia';

describe('AI JSON Response Sanitizer & Fallback Parser', () => {
  it('parses standard valid JSON without issues', () => {
    const raw = '{"name": "Residential Lease", "sectionsCount": 3}';
    const result = extractJsonFromResponse<{ name: string; sectionsCount: number }>(raw);
    expect(result.name).toBe('Residential Lease');
    expect(result.sectionsCount).toBe(3);
  });

  it('strips markdown code fences (```json ... ```)', () => {
    const raw = '```json\n{\n  "documentType": "NDA",\n  "parties": ["Acme", "Beta"]\n}\n```';
    const result = extractJsonFromResponse<{ documentType: string; parties: string[] }>(raw);
    expect(result.documentType).toBe('NDA');
    expect(result.parties).toEqual(['Acme', 'Beta']);
  });

  it('strips leading thinking processes and preambles before the JSON object', () => {
    const raw = `Here's a thinking process:
1. Analyze the Request:
   - User wants me to extract the contract summary.
   - The contract is an Employment Agreement.

Here is the JSON:
{
  "overview": "Employment agreement for Senior Engineer.",
  "status": "active"
}`;
    const result = extractJsonFromResponse<{ overview: string; status: string }>(raw);
    expect(result.overview).toBe('Employment agreement for Senior Engineer.');
    expect(result.status).toBe('active');
  });

  it('strips trailing commentary and punctuation after the JSON object', () => {
    const raw = `\`\`\`json
{
  "keyTakeaways": ["No pets allowed", "Rent due on 1st"]
}
\`\`\`. I hope this helps! Feel free to ask more questions.`;
    const result = extractJsonFromResponse<{ keyTakeaways: string[] }>(raw);
    expect(result.keyTakeaways).toEqual(['No pets allowed', 'Rent due on 1st']);
  });

  it('normalizes smart/curly quotes inside string values and delimiters', () => {
    const raw = `{\n  “overview”: “This is a lease for ‘Apartment 4B’ at 100 Main St.”,\n  “active”: true\n}`;
    const result = extractJsonFromResponse<{ overview: string; active: boolean }>(raw);
    expect(result.overview).toContain('Apartment 4B');
    expect(result.active).toBe(true);
  });

  it('repairs truncated JSON objects cut off mid-stream via jsonrepair fallback', () => {
    // Cut off mid-array before closing brackets
    const truncated = `{\n  "overview": "Partial lease agreement",\n  "clauses": [\n    {\n      "title": "Rent",\n      "amount": "$2,000"\n    },\n    {\n      "title": "Late Fee"`;
    const result = extractJsonFromResponse<{ overview: string; clauses: Array<{ title: string; amount?: string }> }>(truncated);
    expect(result.overview).toBe('Partial lease agreement');
    expect(result.clauses.length).toBeGreaterThanOrEqual(1);
    expect(result.clauses[0].title).toBe('Rent');
  });

  it('handles trailing commas in objects and arrays', () => {
    const trailingComma = `{\n  "items": [\n    "point 1",\n    "point 2",\n  ],\n  "title": "Agreement",\n}`;
    const result = extractJsonFromResponse<{ items: string[]; title: string }>(trailingComma);
    expect(result.items.length).toBe(2);
    expect(result.title).toBe('Agreement');
  });

  it('throws helpful error when the model output contains no JSON whatsoever', () => {
    const nonJson = 'I am sorry, but I cannot analyze this document because it is not in English.';
    expect(() => extractJsonFromResponse(nonJson)).toThrow('Failed to parse AI structured response as JSON');
  });
});
