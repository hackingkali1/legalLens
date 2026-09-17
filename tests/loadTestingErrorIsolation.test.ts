import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as analyzeRouteHandler } from '@/app/api/analyze/route';
import { sessionAnalysisCache } from '@/lib/cache/analysisCache';
import { LegalLensDocument } from '@/types/document';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('Item 2 Load-Test: 6 Back-to-Back Analyses & Resilience to Rate Limits / Timeouts', () => {
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  const mockSummaryJSON = {
    overview: 'This is an executive summary of the agreement.',
    documentType: 'Commercial Lease',
    mainParties: ['Landlord Inc', 'Tenant LLC'],
    effectiveDateOrTerm: '12 Months',
    keyTakeaways: ['30-day notice', 'Rent due 1st of month'],
    disclaimer: LEGAL_DISCLAIMER,
    sectionSummaries: [
      {
        sectionId: 'sec-1',
        plainLanguageSummary: 'Rent obligations',
        keyPoints: ['Due 1st'],
      },
    ],
  };

  const mockClausesJSON = {
    clauses: [
      {
        category: 'termination',
        attentionLevel: 'high',
        title: '30-Day Notice Window',
        reason: 'Requires written notice',
        plainLanguageExplanation: 'Must give 30 days notice to end lease.',
        sourceSection: 'Section 1: Termination',
        quote: 'Either party may terminate on 30 days notice.',
        questionForLawyer: 'Can we negotiate for 60 days?',
      },
    ],
  };

  const sampleDoc1: LegalLensDocument = {
    id: 'load-doc-1',
    fileName: 'Residential_Lease.txt',
    fileSize: 1500,
    fileType: 'txt',
    uploadedAt: new Date().toISOString(),
    rawText: 'Section 1: Termination. Either party may terminate on 30 days notice.',
    sections: [
      {
        id: 'sec-1',
        title: 'Section 1: Termination',
        originalText: 'Either party may terminate on 30 days notice.',
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 0,
        endIndex: 45,
      },
    ],
    chunks: [],
    clauses: [],
    lawyerChecklist: [],
  };

  const sampleDoc2: LegalLensDocument = {
    ...sampleDoc1,
    id: 'load-doc-2',
    fileName: 'Commercial_Lease.txt',
    rawText: 'Section 1: Indemnity. Tenant shall indemnify Landlord.',
    sections: [
      {
        id: 'sec-2',
        title: 'Section 1: Indemnity',
        originalText: 'Tenant shall indemnify Landlord.',
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 0,
        endIndex: 32,
      },
    ],
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'nvapi-load-test-key';
    sessionAnalysisCache.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NVIDIA_API_KEY = originalApiKey;
    sessionAnalysisCache.clear();
    vi.restoreAllMocks();
  });

  it('runs 6 back-to-back analyses simulating a demo: handles cache, rate-limits, timeouts, retries, and errors gracefully', async () => {
    let callCount = 0;

    let allowClauseRetrySuccess = false;

    // Deterministic mock fetch handler matching based on document payload content
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      callCount++;
      const bodyStr = String(init.body || '').toLowerCase();
      const isClauses = bodyStr.includes('extract all important clauses') || bodyStr.includes('attentionlevel');

      // Call 3 simulation: Document 2 clauses trigger 429 Rate Limit (both primary & fallback fail)
      if (isClauses && bodyStr.includes('tenant shall indemnify') && !allowClauseRetrySuccess) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded: 429 Too Many Requests',
          json: async () => ({ error: { message: 'Rate limit exceeded: 429 Too Many Requests' } }),
        });
      }

      // Call 4 simulation: Document 3 summary triggers 504 Timeout
      if (!isClauses && bodyStr.includes('timeout test')) {
        return Promise.resolve({
          ok: false,
          status: 504,
          text: async () => 'Gateway Timeout: 504',
          json: async () => ({ error: { message: 'Gateway Timeout: Upstream model timed out' } }),
        });
      }

      // Call 6 simulation: Document 4 causes both summary and clauses to fail
      if (bodyStr.includes('double failure test')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
          json: async () => ({ error: { message: 'Service unavailable' } }),
        });
      }

      // Default: Return success response
      const responseData = isClauses ? mockClausesJSON : mockSummaryJSON;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(responseData) } }],
        }),
      });
    });

    global.fetch = fetchMock;

    // --- CALL 1: First Analysis (Fresh Analysis, Full Success) ---
    const req1 = new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: sampleDoc1, step: 'all' }),
    });
    const res1 = await analyzeRouteHandler(req1);
    const data1 = await res1.json();

    expect(res1.status).toBe(200);
    expect(data1.summary.documentType).toBe('Commercial Lease');
    expect(data1.clauses).toHaveLength(1);
    expect(data1.errors).toBeUndefined();
    // 1 summary call + 1 clause call = 2 fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // --- CALL 2: Repeated View / Analysis of Same Document (Hit Session Cache, 0 New LLM Calls) ---
    const req2 = new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: sampleDoc1, step: 'all' }),
    });
    const res2 = await analyzeRouteHandler(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(data2.summary.documentType).toBe('Commercial Lease');
    // CALL COUNT REMAINS 2 (0 new LLM calls!)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // --- CALL 3: New Document Analysis where Clauses Hits 429 Rate Limit (Isolated Error State) ---
    const req3 = new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: sampleDoc2, step: 'all' }),
    });
    const res3 = await analyzeRouteHandler(req3);
    const data3 = await res3.json();

    // MUST NOT CRASH with 500: returns 200 with summary preserved and clause error scoped
    expect(res3.status).toBe(200);
    expect(data3.summary).toBeDefined();
    expect(data3.summary.documentType).toBe('Commercial Lease');
    expect(data3.errors).toBeDefined();
    expect(data3.errors.clauses).toContain('Something went wrong detecting clause attention flags');
    expect(data3.errors.summary).toBeUndefined();

    // --- CALL 4: New Document Analysis where Summary Hits 504 Timeout (Isolated Error State) ---
    const sampleDoc3: LegalLensDocument = {
      ...sampleDoc2,
      id: 'load-doc-3',
      rawText: 'Section 1: Timeout test section text.',
      sections: [
        {
          id: 'sec-3',
          title: 'Section 1: Timeout Section',
          originalText: 'Timeout test section text.',
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 30,
        },
      ],
    };
    const req4 = new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: sampleDoc3, step: 'all' }),
    });
    const res4 = await analyzeRouteHandler(req4);
    const data4 = await res4.json();

    // MUST NOT CRASH with 500: returns 200 with clauses preserved and summary error scoped
    expect(res4.status).toBe(200);
    expect(data4.clauses).toHaveLength(1);
    expect(data4.errors).toBeDefined();
    expect(data4.errors.summary).toContain('Something went wrong generating the plain summary');
    expect(data4.errors.clauses).toBeUndefined();

    // --- CALL 5: Targeted Retry for Failed Step Only (step: 'clauses') ---
    allowClauseRetrySuccess = true;
    const req5 = new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: data3, step: 'clauses' }),
    });
    const res5 = await analyzeRouteHandler(req5);
    const data5 = await res5.json();

    expect(res5.status).toBe(200);
    expect(data5.clauses).toHaveLength(1);

    // --- CALL 6: Both Steps Fail (Graceful Shielded 500 with Clean User-Safe Error) ---
    const sampleDoc4: LegalLensDocument = {
      ...sampleDoc2,
      id: 'load-doc-4',
      rawText: 'Section 1: Double failure test section text.',
      sections: [
        {
          id: 'sec-4',
          title: 'Section 1: Double Failure Section',
          originalText: 'Double failure test section text.',
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 35,
        },
      ],
    };
    const req6 = new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: sampleDoc4, step: 'all' }),
    });
    const res6 = await analyzeRouteHandler(req6);
    const data6 = await res6.json();

    expect(res6.status).toBe(500);
    expect(data6.error).toBe('Something went wrong analyzing this document — please try again.');
    // Never leak raw exceptions or internals
    expect(data6.error).not.toContain('Rate limit');
    expect(data6.error).not.toContain('Gateway Timeout');
    expect(data6.error).not.toContain('at ');
  });
});
