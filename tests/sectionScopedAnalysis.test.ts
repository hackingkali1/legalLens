import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/analyze/route';
import { classifyAnalysisError, logAnalysisDiagnostic } from '@/lib/validation/userSafeError';
import * as analyzeDocModule from '@/lib/ai/analyzeDocument';
import * as analyzeClausesModule from '@/lib/ai/analyzeClauses';
import { LegalLensDocument } from '@/types/document';
import { z } from 'zod';

describe('Section-Scoped Analysis & Diagnostic Error Handling', () => {
  describe('Diagnostic Error Classifier (HTTP Status & Error Type)', () => {
    it('accurately identifies 429 rate limit errors with status and error type in reason', () => {
      const err = new Error('NVIDIA NIM API error (status 429): Rate limit exceeded');
      const diag = classifyAnalysisError(err);
      expect(diag.statusCode).toBe(429);
      expect(diag.errorType).toBe('rate-limit');
      expect(diag.reason).toContain('429 rate-limit');
      expect(diag.reason).toContain('Rate limit exceeded');
    });

    it('accurately identifies timeout errors with status and error type in reason', () => {
      const err = new Error('Upstream request timed out after 30000ms');
      const diag = classifyAnalysisError(err);
      expect(diag.statusCode).toBe(504);
      expect(diag.errorType).toBe('timeout');
      expect(diag.reason).toContain('504 timeout');
      expect(diag.reason).toContain('timed out');
    });

    it('accurately identifies JSON parse failures with status and error type in reason', () => {
      const err = new Error('Failed to parse AI structured response as JSON: Unexpected token <');
      const diag = classifyAnalysisError(err);
      expect(diag.statusCode).toBe(502);
      expect(diag.errorType).toBe('json-parse');
      expect(diag.reason).toContain('502 json-parse');
      expect(diag.reason).toContain('non-JSON');
    });

    it('accurately identifies Zod schema validation errors with status and error type in reason', () => {
      const result = z.object({ overview: z.string() }).safeParse({});
      expect(result.success).toBe(false);
      if (result.success) return;
      const diag = classifyAnalysisError(result.error);
      expect(diag.statusCode).toBe(422);
      expect(diag.errorType).toBe('schema-validation');
      expect(diag.reason).toContain('422 schema-validation');
    });

    it('accurately identifies network connectivity failures with status and error type in reason', () => {
      const err = new Error('fetch failed: ECONNREFUSED');
      const diag = classifyAnalysisError(err);
      expect(diag.statusCode).toBe(503);
      expect(diag.errorType).toBe('network');
      expect(diag.reason).toContain('503 network');
    });

    it('logs diagnostic details including status and errorType in reason without crashing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logAnalysisDiagnostic('summary', new Error('status 429: Too Many Requests'));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LegalLens Analysis Debug] Step: summary | Status: 429 | ErrorType: rate-limit | Reason: 429 rate-limit')
      );
      warnSpy.mockRestore();
    });
  });

  describe('Isolated Step Execution in /api/analyze', () => {
    const baseDoc: LegalLensDocument = {
      id: 'test-doc-1',
      fileName: 'notice.txt',
      fileSize: 1000,
      fileType: 'txt',
      uploadedAt: new Date().toISOString(),
      rawText: 'This is test agreement text with notice terms.',
      sections: [
        {
          id: 'sec-1',
          sectionNumber: '1',
          title: 'NOTICE TERMS',
          originalText: 'Notice must be delivered in 14 days.',
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 36,
        },
      ],
      chunks: [],
      clauses: [],
      lawyerChecklist: [],
    };

    it('retains successful clause data and scopes error when summary fails', async () => {
      const mockClauses = [
        {
          id: 'clause-1',
          category: 'obligations' as const,
          attentionLevel: 'high' as const,
          title: 'Mandatory Court Appearance',
          reason: 'Must appear in person',
          plainLanguageExplanation: 'You must appear in court.',
          sourceSection: 'NOTICE TERMS',
          quote: 'Notice must be delivered in 14 days.',
          questionForLawyer: 'Can an attorney appear on my behalf?',
        },
      ];

      vi.spyOn(analyzeDocModule, 'generateDocumentSummary').mockRejectedValueOnce(
        new Error('status 429: NVIDIA NIM rate limit')
      );
      vi.spyOn(analyzeClausesModule, 'detectAndClassifyClauses').mockResolvedValueOnce({
        clauses: mockClauses,
        lawyerChecklist: [],
        updatedSections: baseDoc.sections,
      });

      const req = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: baseDoc, step: 'all' }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Clauses are successfully preserved
      expect(data.clauses.length).toBe(1);
      expect(data.clauses[0].title).toBe('Mandatory Court Appearance');

      // Error is scoped to summary only, not clauses
      expect(data.errors).toBeDefined();
      expect(data.errors.summary).toContain('Something went wrong generating the plain summary');
      expect(data.errors.clauses).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('retains successful summary data and scopes error when clause detection fails', async () => {
      const mockSummary = {
        overview: 'Overview of notice document.',
        documentType: 'Legal Notice',
        keyTakeaways: ['14 day response required'],
        disclaimer: 'Not legal advice',
      };

      vi.spyOn(analyzeDocModule, 'generateDocumentSummary').mockResolvedValueOnce({
        summary: mockSummary,
        updatedSections: baseDoc.sections,
      });
      vi.spyOn(analyzeClausesModule, 'detectAndClassifyClauses').mockRejectedValueOnce(
        new Error('Upstream completion timed out')
      );

      const req = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: baseDoc, step: 'all' }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.summary.overview).toBe('Overview of notice document.');

      // Error is scoped to clauses only
      expect(data.errors).toBeDefined();
      expect(data.errors.clauses).toContain('Something went wrong detecting clause attention flags');
      expect(data.errors.summary).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('supports standalone retry for a specific step', async () => {
      const mockSummary = {
        overview: 'Retried summary.',
        documentType: 'Legal Notice',
        keyTakeaways: ['Takeaway 1'],
        disclaimer: 'Not legal advice',
      };

      const summarySpy = vi
        .spyOn(analyzeDocModule, 'generateDocumentSummary')
        .mockResolvedValueOnce({
          summary: mockSummary,
          updatedSections: baseDoc.sections,
        });

      const req = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: baseDoc, step: 'summary' }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.summary.overview).toBe('Retried summary.');
      expect(summarySpy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });
  });
});
