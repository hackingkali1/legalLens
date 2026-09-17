import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffLines } from 'diff';
import { NextRequest } from 'next/server';
import { SAMPLE_NDA_V1_TEXT, SAMPLE_NDA_V2_TEXT } from '@/lib/fixtures/samples';
import { CompareResponseSchema, CompareRequestSchema } from '@/lib/validation/clauseSchema';
import { LEGAL_DISCLAIMER } from '@/lib/constants';
import { POST } from '@/app/api/compare/route';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';
import { sessionAnalysisCache } from '@/lib/cache/analysisCache';
import * as compareDocModule from '@/lib/ai/compareDocuments';

describe('Document Comparison & Material Change Analysis', () => {
  beforeEach(() => {
    sessionAnalysisCache.clear();
  });
  it('computes textual line diffs between Document A and Document B', () => {
    const diff = diffLines(SAMPLE_NDA_V1_TEXT, SAMPLE_NDA_V2_TEXT);
    expect(diff.length).toBeGreaterThan(1);

    const hasAdded = diff.some((part) => part.added);
    const hasRemoved = diff.some((part) => part.removed);

    expect(hasAdded).toBe(true);
    expect(hasRemoved).toBe(true);
  });

  it('validates structured AI compare output schema without recommendation', () => {
    const mockCompareResponse = {
      summaryOverview:
        'Version 2 materially expands the definition of Confidential Information, removes the $50,000 liability cap in favor of unlimited liability, and extends confidentiality obligations regarding trade secrets to perpetual.',
      materialChanges: [
        {
          title: 'Removal of Liability Cap and Introduction of Unlimited Liability',
          type: 'modified',
          attentionLevel: 'high',
          plainLanguageExplanation:
            'Version 1 capped total damages at $50,000. Version 2 eliminates this cap completely, making potential financial liability unlimited.',
          sourceDocA: {
            sectionTitle: '5. LIMITATION OF LIABILITY',
            quote: "Each party's aggregate liability under this Agreement shall be limited to $50,000.00.",
          },
          sourceDocB: {
            sectionTitle: '5. INDEMNIFICATION AND UNLIMITED LIABILITY',
            quote: 'The prior $50,000 liability cap is hereby removed; liability for unauthorized disclosure or misuse shall be unlimited.',
          },
        },
        {
          title: 'Shortened Discussion Termination Window',
          type: 'modified',
          attentionLevel: 'medium',
          plainLanguageExplanation:
            'Either party could terminate discussions on 30 days notice in Version 1. Version 2 reduces this window to 5 days.',
          sourceDocA: {
            sectionTitle: '4. TERM AND TERMINATION',
            quote: 'Either party may terminate discussions at any time upon thirty (30) days written notice.',
          },
          sourceDocB: {
            sectionTitle: '4. TERM AND TERMINATION',
            quote: "Either party may terminate discussions upon five (5) days' written notice.",
          },
        },
      ],
      disclaimer: LEGAL_DISCLAIMER,
    };

    const validated = CompareResponseSchema.parse(mockCompareResponse);
    expect(validated.materialChanges.length).toBe(2);
    expect(validated.materialChanges[0].attentionLevel).toBe('high');
    expect(validated.disclaimer).toBe(LEGAL_DISCLAIMER);
  });

  describe('Bug 2: Request Payload Validation & Error Shielding', () => {
    it('validates correct request payload with CompareRequestSchema', () => {
      const validPayload = {
        docAName: 'Base NDA',
        docAText: 'Doc A sample content',
        docBName: 'Revised NDA',
        docBText: 'Doc B sample content',
      };

      const result = CompareRequestSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.docAName).toBe('Base NDA');
        expect(result.data.docAText).toBe('Doc A sample content');
      }
    });

    it('rejects array payloads or missing fields in CompareRequestSchema', () => {
      // Positional array payload instead of named object
      const arrayPayload = ['Doc A content', 'Doc B content'];
      const arrayResult = CompareRequestSchema.safeParse(arrayPayload);
      expect(arrayResult.success).toBe(false);

      // Missing Document B
      const missingB = { docAName: 'A', docAText: 'Text A' };
      const missingBResult = CompareRequestSchema.safeParse(missingB);
      expect(missingBResult.success).toBe(false);
    });

    it('returns clean 400 with user-safe message when array payload is sent to /api/compare', async () => {
      const arrayPayload = [SAMPLE_NDA_V1_TEXT, SAMPLE_NDA_V2_TEXT];

      const req = new NextRequest('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arrayPayload),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe(
        'Invalid comparison request. Please provide valid text for both Document A and Document B.'
      );
      // NEVER leak raw Zod dump to user
      expect(data.error).not.toContain('invalid_type');
      expect(data.error).not.toContain('expected');
      expect(data.error).not.toContain('received array');
      expect(data.error.startsWith('[')).toBe(false);
    });

    it('returns clean 400 with user-safe message when document text is missing', async () => {
      const invalidPayload = {
        docAName: 'Version 1',
        docAText: '',
        docBName: 'Version 2',
        docBText: 'Valid text B',
      };

      const req = new NextRequest('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe(
        'Invalid comparison request. Please provide valid text for both Document A and Document B.'
      );
      expect(data.error).not.toContain('invalid_type');
    });

    it('succeeds with 200 when valid payload is sent to /api/compare', async () => {
      const mockResult = {
        docAName: 'Base NDA',
        docBName: 'Revised NDA',
        summaryOverview: 'Overview of changes',
        materialChanges: [],
        disclaimer: LEGAL_DISCLAIMER,
      };

      const spy = vi
        .spyOn(compareDocModule, 'compareTwoDocuments')
        .mockResolvedValueOnce(mockResult);

      const validPayload = {
        docAName: 'Base NDA',
        docAText: 'Sample text A',
        docBName: 'Revised NDA',
        docBText: 'Sample text B',
      };

      const req = new NextRequest('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.summaryOverview).toBe('Overview of changes');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('shields raw schema validation errors and returns user-safe error message on unexpected comparison failure', () => {
      // Simulate raw Zod error dump
      const simulatedZodError = new Error(
        '[{"expected":"object","code":"invalid_type","path":[],"message":"Invalid input: expected object, received array"}]'
      );

      const safeMessage = getUserSafeErrorMessage(
        simulatedZodError,
        'Something went wrong comparing these documents — please try again.'
      );

      expect(safeMessage).toBe(
        'Something went wrong comparing these documents — please try again.'
      );
      expect(safeMessage).not.toContain('invalid_type');
    });

    it('caches comparison results in sessionAnalysisCache on repeated requests', async () => {
      const mockResult = {
        docAName: 'Base NDA',
        docBName: 'Revised NDA',
        summaryOverview: 'Overview of changes',
        materialChanges: [],
        disclaimer: LEGAL_DISCLAIMER,
      };

      const spy = vi
        .spyOn(compareDocModule, 'compareTwoDocuments')
        .mockResolvedValue(mockResult);

      const validPayload = {
        docAName: 'Base NDA',
        docAText: 'Sample text A for cache test',
        docBName: 'Revised NDA',
        docBText: 'Sample text B for cache test',
      };

      // 1. First call: cache miss -> invokes compareTwoDocuments
      const req1 = new NextRequest('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

      const res1 = await POST(req1);
      const data1 = await res1.json();
      expect(res1.status).toBe(200);
      expect(data1.summaryOverview).toBe('Overview of changes');
      expect(spy).toHaveBeenCalledTimes(1);

      // 2. Second call: identical payload -> served from sessionAnalysisCache (0 new calls)
      const req2 = new NextRequest('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

      const res2 = await POST(req2);
      const data2 = await res2.json();
      expect(res2.status).toBe(200);
      expect(data2.summaryOverview).toBe('Overview of changes');
      // Call count remains 1!
      expect(spy).toHaveBeenCalledTimes(1);

      // 3. Third call: skipCache / forceRefresh -> bypasses cache and calls compareTwoDocuments
      const req3 = new NextRequest('http://localhost:3000/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-skip-cache': 'true' },
        body: JSON.stringify(validPayload),
      });

      const res3 = await POST(req3);
      expect(res3.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });
  });
});

