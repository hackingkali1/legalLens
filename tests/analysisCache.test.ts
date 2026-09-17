import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sessionAnalysisCache, AnalysisSessionCache } from '@/lib/cache/analysisCache';
import { detectAndClassifyClauses } from '@/lib/ai/analyzeClauses';
import { generateDocumentSummary } from '@/lib/ai/analyzeDocument';
import { answerDocumentQuestion } from '@/lib/ai/answerQuestion';
import { NextRequest } from 'next/server';
import { POST as analyzeRouteHandler } from '@/app/api/analyze/route';
import { DocumentSection, DocumentChunk, LegalLensDocument } from '@/types/document';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('Analysis Session Cache & LLM Call Reduction Pipeline', () => {
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'nvapi-test-cache-key';
    sessionAnalysisCache.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NVIDIA_API_KEY = originalApiKey;
    sessionAnalysisCache.clear();
    vi.restoreAllMocks();
  });

  // Helper to mock LLM responses and track exact invocation counts
  function mockNvidiaResponses(responses: (object | string | (() => Promise<Response>))[]) {
    let callIndex = 0;
    return vi.fn().mockImplementation(() => {
      const resp = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      if (typeof resp === 'function') {
        return resp();
      }
      const rawContent = typeof resp === 'string' ? resp : JSON.stringify(resp);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: rawContent } }],
        }),
      });
    });
  }

  // Sample single-chunk document data (< CLAUSE_SINGLE_PASS_CHARS = 22,000 chars)
  // These sections are representative of a typical 5-10 page legal document.
  // The clause analyzer sends the full document in ONE call (single-pass).
  const sampleSection1: DocumentSection = {
    id: 'sec-1',
    title: 'Section 1: Termination & Renewal',
    originalText:
      'Either party may terminate upon sixty (60) days prior written notice. '.repeat(40), // ~2800 chars
    plainLanguageSummary: '',
    keyPoints: [],
    startIndex: 0,
    endIndex: 2800,
  };

  const sampleSection2: DocumentSection = {
    id: 'sec-2',
    title: 'Section 2: Indemnification & Liability',
    originalText:
      'Tenant agrees to indemnify, defend, and hold harmless the Landlord from all liabilities. '.repeat(35), // ~3100 chars
    plainLanguageSummary: '',
    keyPoints: [],
    startIndex: 2800,
    endIndex: 5900,
  };

  const multiSections = [sampleSection1, sampleSection2];
  const multiDocText = `${sampleSection1.originalText}\n\n${sampleSection2.originalText}`;

  // Combined clause response for single-pass mode (both clauses returned in one call)
  const mockSinglePassClauseResponse = {
    clauses: [
      {
        category: 'termination',
        attentionLevel: 'high',
        title: '60-Day Termination Notice Requirement',
        reason: 'Requires 60 days advance notice.',
        plainLanguageExplanation: 'Must give 60 days notice.',
        sourceSection: 'Section 1: Termination & Renewal',
        quote: 'Either party may terminate upon sixty (60) days prior written notice.',
        questionForLawyer: 'Can notice period be reduced to 30 days?',
      },
      {
        category: 'indemnity',
        attentionLevel: 'high',
        title: 'Unilateral Tenant Indemnification',
        reason: 'Tenant holds Landlord harmless.',
        plainLanguageExplanation: 'Tenant bears broad liability.',
        sourceSection: 'Section 2: Indemnification & Liability',
        quote: 'Tenant agrees to indemnify, defend, and hold harmless the Landlord from all liabilities.',
        questionForLawyer: 'Can this indemnity clause be made mutual?',
      },
    ],
  };

  const mockSummaryResponse = {
    overview: 'This is an executive overview of the commercial agreement.',
    documentType: 'Commercial Lease Agreement',
    mainParties: ['Landlord LLC', 'Tenant Inc'],
    effectiveDateOrTerm: '12 Months',
    keyTakeaways: ['60-day termination requirement', 'Broad tenant indemnification obligations'],
    disclaimer: LEGAL_DISCLAIMER,
    sectionSummaries: [
      {
        sectionId: 'sec-1',
        plainLanguageSummary: 'Outlines 60-day termination procedures.',
        keyPoints: ['60 days notice required'],
      },
      {
        sectionId: 'sec-2',
        plainLanguageSummary: 'Details liability and indemnification terms.',
        keyPoints: ['Tenant indemnifies landlord'],
      },
    ],
  };

  // =========================================================================
  // 1. Core Cache Operations & Session Scoping
  // =========================================================================
  describe('AnalysisSessionCache Core Architecture', () => {
    it('computes deterministic SHA-256 hashes for document contents', () => {
      const hash1 = sessionAnalysisCache.computeHash('Sample Legal Document Text');
      const hash2 = sessionAnalysisCache.computeHash('Sample Legal Document Text');
      const hash3 = sessionAnalysisCache.computeHash('Sample Legal Document Text ');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      // Trims whitespace before hashing
      expect(hash1).toBe(hash3);
    });

    it('stores and retrieves typed values with correct cache semantics', () => {
      const testData = { clauses: [{ id: 'c1', title: 'Test Clause' }] };
      sessionAnalysisCache.set('test-typed-key', testData);

      const retrieved = sessionAnalysisCache.get<typeof testData>('test-typed-key');
      expect(retrieved).toEqual(testData);
      expect(retrieved?.clauses[0].title).toBe('Test Clause');
    });

    it('manages LRU eviction when capacity is exceeded', () => {
      const smallCache = new AnalysisSessionCache(2);
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');

      // Access key1 to make key2 the least recently used
      expect(smallCache.get('key1')).toBe('value1');

      // Insert key3 -> should evict key2
      smallCache.set('key3', 'value3');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeUndefined();
      expect(smallCache.get('key3')).toBe('value3');
    });

    it('clears all entries and resets statistics when session ends', () => {
      sessionAnalysisCache.set('test-key', { data: 'test-value' });
      expect(sessionAnalysisCache.get('test-key')).toBeDefined();

      sessionAnalysisCache.clear();

      expect(sessionAnalysisCache.get('test-key')).toBeUndefined();
      const stats = sessionAnalysisCache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      // Miss count is 1 from the get call after clear
      expect(stats.misses).toBe(1);
    });
  });

  // =========================================================================
  // 2. Full Document Clause Analysis Caching (Requirement 1 & 5)
  // =========================================================================
  describe('Document-Level Clause Analysis Caching', () => {
    it('executes 1 LLM call (single-pass) on first analysis and serves from cache on second analysis (0 new LLM calls)', async () => {
      // Documents under CLAUSE_SINGLE_PASS_CHARS (22,000 chars) are analyzed in 1 call.
      const fetchMock = mockNvidiaResponses([mockSinglePassClauseResponse]);
      global.fetch = fetchMock;

      // First analysis of document
      const firstResult = await detectAndClassifyClauses(multiDocText, multiSections);
      expect(firstResult.clauses).toHaveLength(2);
      // Single-pass: exactly 1 LLM call for the full document
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second analysis of same document (e.g. user re-opens doc or navigates between tabs)
      const secondResult = await detectAndClassifyClauses(multiDocText, multiSections);

      // Results must match identically
      expect(secondResult.clauses).toHaveLength(2);
      expect(secondResult.clauses[0].title).toBe(firstResult.clauses[0].title);
      expect(secondResult.clauses[1].title).toBe(firstResult.clauses[1].title);
      expect(secondResult.lawyerChecklist).toHaveLength(2);

      // CRITICAL: Call count MUST remain exactly 1 (zero new LLM calls made on repeated analysis)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sessionAnalysisCache.getStats().hits).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 3. Per-Chunk Caching & Partial Failure Retry (Requirement 4 & 5)
  // =========================================================================
  describe('Per-Chunk Caching & Partial Chunk Failure Retry', () => {
    it('when analysis fails, retrying executes fresh LLM calls (single-pass cannot partially cache)', async () => {
      // In single-pass mode the entire document is one atomic call.
      // On failure the whole call is retried. On success, the full result is cached.
      let callCount = 0;
      let shouldFail = true;

      const fetchMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (shouldFail) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: async () => 'Unauthorized',
            json: async () => ({ error: { message: 'Unauthorized' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(mockSinglePassClauseResponse) } }],
          }),
        });
      });

      global.fetch = fetchMock;

      // Step 1: Initial analysis attempt fails
      await expect(detectAndClassifyClauses(multiDocText, multiSections)).rejects.toThrow();
      expect(callCount).toBe(1);

      // Step 2: Retry - now it succeeds
      shouldFail = false;
      const retryResult = await detectAndClassifyClauses(multiDocText, multiSections);
      expect(retryResult.clauses).toHaveLength(2);
      expect(callCount).toBe(2);

      // Step 3: Third call hits the cache (0 new LLM calls)
      await detectAndClassifyClauses(multiDocText, multiSections);
      expect(callCount).toBe(2);
    });
  });

  // =========================================================================
  // 4. Document Summary Caching (Requirement 1 & 5)
  // =========================================================================
  describe('Document Summary Caching', () => {
    it('caches summary response and makes 0 new LLM calls on second summary call', async () => {
      const fetchMock = mockNvidiaResponses([mockSummaryResponse]);
      global.fetch = fetchMock;

      // First call: generates summary
      const firstRes = await generateDocumentSummary(multiSections);
      expect(firstRes.summary.documentType).toBe('Commercial Lease Agreement');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call: serves from cache
      const secondRes = await generateDocumentSummary(multiSections);
      expect(secondRes.summary.documentType).toBe('Commercial Lease Agreement');
      expect(secondRes.summary.overview).toBe(firstRes.summary.overview);

      // Fetch was NOT called again (call count is still 1)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. Document Q&A (qa-context) Caching (Requirement 1)
  // =========================================================================
  describe('Document Q&A (qa-context) Caching', () => {
    const sampleChunks: DocumentChunk[] = [
      {
        chunkId: 'chk-1',
        sectionId: 'sec-1',
        sectionTitle: 'Section 1: Termination & Renewal',
        text: sampleSection1.originalText,
        charStart: 0,
        charEnd: 2800,
        tokenEstimate: 700,
      },
    ];

    const mockQAResponse = {
      answer: 'The termination clause requires 60 days advance written notice.',
      isOutOfScope: false,
      disclaimer: LEGAL_DISCLAIMER,
      citations: [
        {
          sectionTitle: 'Section 1: Termination & Renewal',
          quote: 'Either party may terminate upon sixty (60) days prior written notice.',
          relevanceExplanation: 'Specifies the 60-day notice requirement.',
        },
      ],
    };

    it('caches answers for repeated questions on the same document context', async () => {
      const fetchMock = mockNvidiaResponses([mockQAResponse]);
      global.fetch = fetchMock;

      const question = 'What is the termination notice period?';

      // First QA call
      const firstAnswer = await answerDocumentQuestion(
        question,
        sampleChunks,
        multiDocText
      );
      expect(firstAnswer.text).toContain('60 days');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second QA call with identical question and document context
      const secondAnswer = await answerDocumentQuestion(
        question,
        sampleChunks,
        multiDocText
      );
      expect(secondAnswer.text).toBe(firstAnswer.text);

      // Call count remains 1 (0 new LLM calls)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. Cache-Busting Path (skipCache: true / forceRefresh: true) (Requirement 3)
  // =========================================================================
  describe('Cache-Busting Path (skipCache)', () => {
    it('bypasses cache and executes fresh LLM calls when skipCache is true', async () => {
      // Single-pass: each detectAndClassifyClauses call = 1 LLM call
      const fetchMock = mockNvidiaResponses([
        mockSinglePassClauseResponse,
        mockSinglePassClauseResponse,
      ]);
      global.fetch = fetchMock;

      // First call (populates cache with 1 call — single-pass)
      await detectAndClassifyClauses(multiDocText, multiSections);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Normal second call uses cache (still 1 call)
      await detectAndClassifyClauses(multiDocText, multiSections);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Explicit re-analysis with skipCache: true forces fresh LLM call
      await detectAndClassifyClauses(multiDocText, multiSections, { skipCache: true });
      // Call count increases by 1 -> 2 calls total
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('bypasses summary cache when skipCache is true', async () => {
      const fetchMock = mockNvidiaResponses([mockSummaryResponse, mockSummaryResponse]);
      global.fetch = fetchMock;

      // First call
      await generateDocumentSummary(multiSections);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call with skipCache
      await generateDocumentSummary(multiSections, { skipCache: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 7. API Route End-to-End Integration (/api/analyze)
  // =========================================================================
  describe('API Route End-to-End (/api/analyze) Caching', () => {
    const sampleLegalDoc: LegalLensDocument = {
      id: 'doc-cache-test-1',
      fileName: 'Commercial_Lease.txt',
      fileType: 'txt',
      fileSize: multiDocText.length,
      uploadedAt: new Date().toISOString(),
      rawText: multiDocText,
      sections: multiSections,
      chunks: [],
      clauses: [],
      lawyerChecklist: [],
    };

    it('serves repeated /api/analyze requests from cache with 0 additional LLM calls', async () => {
      // Single-pass: 1 summary call + 1 clause call = 2 LLM calls total per fresh analysis
      const fetchMock = mockNvidiaResponses([
        mockSummaryResponse,
        mockSinglePassClauseResponse,
        // Responses for skipCache test
        mockSummaryResponse,
        mockSinglePassClauseResponse,
      ]);
      global.fetch = fetchMock;

      // 1. First API request: step 'all'
      const req1 = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: sampleLegalDoc, step: 'all' }),
      });
      const res1 = await analyzeRouteHandler(req1);
      const data1 = await res1.json();

      expect(res1.status).toBe(200);
      expect(data1.summary).toBeDefined();
      expect(data1.clauses).toHaveLength(2);
      // 1 summary call + 1 clause call (single-pass) = 2 LLM calls
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // 2. Second API request with identical document: served entirely from cache
      const req2 = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: sampleLegalDoc, step: 'all' }),
      });
      const res2 = await analyzeRouteHandler(req2);
      const data2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(data2.summary.documentType).toBe(data1.summary.documentType);
      expect(data2.clauses).toHaveLength(2);
      // CALL COUNT REMAINS EXACTLY 2 (0 NEW CALLS!)
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // 3. Third API request with skipCache: true forces fresh LLM calls
      const req3 = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: sampleLegalDoc, step: 'all', skipCache: true }),
      });
      const res3 = await analyzeRouteHandler(req3);
      expect(res3.status).toBe(200);
      // 2 new calls executed -> total 4 calls
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // =========================================================================
  // 8. Session Call Reduction Metrics (Upload -> Switch Tabs -> Re-open -> Retry)
  // =========================================================================
  describe('Typical Session Call Count Benchmark', () => {
    it('proves call reduction across a realistic user lifecycle: upload -> view summary -> switch tabs -> come back -> retry', async () => {
      // Benchmark tracking
      let actualCallsWithCache = 0;

      const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        actualCallsWithCache++;
        const bodyStr = String(init.body || '').toLowerCase();
        if (bodyStr.includes('### section id:') || bodyStr.includes('sectionsummaries')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: JSON.stringify(mockSummaryResponse) } }] }),
          });
        }
        if (bodyStr.includes('user question:') || bodyStr.includes('document context')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: JSON.stringify({
              answer: 'Notice period is 60 days.',
              citations: [{ sectionTitle: 'Section 1: Termination & Renewal', quote: 'sixty (60) days prior written notice' }],
              isOutOfScope: false,
              disclaimer: LEGAL_DISCLAIMER,
            }) } }] }),
          });
        }
        // Single-pass clause analysis: whole document in one call
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: JSON.stringify(mockSinglePassClauseResponse) } }] }),
        });
      });

      global.fetch = fetchMock;

      // Event 1: Initial upload & analyze (1 summary call + 1 clause call — single-pass)
      await generateDocumentSummary(multiSections);
      await detectAndClassifyClauses(multiDocText, multiSections);
      // Initial calls: 1 summary + 1 clause = 2 calls
      expect(actualCallsWithCache).toBe(2);

      // Event 2: User views summary, then switches to "Clause Attention Flags" tab
      await detectAndClassifyClauses(multiDocText, multiSections);
      // Cache HIT: 0 new calls
      expect(actualCallsWithCache).toBe(2);

      // Event 3: User switches to Document Viewer, then comes back to Plain Summary
      await generateDocumentSummary(multiSections);
      // Cache HIT: 0 new calls
      expect(actualCallsWithCache).toBe(2);

      // Event 4: Re-opening the same document later in the session
      await generateDocumentSummary(multiSections);
      await detectAndClassifyClauses(multiDocText, multiSections);
      // Cache HIT: 0 new calls
      expect(actualCallsWithCache).toBe(2);

      // Event 5: User asks QA question on the document
      const sampleChunks: DocumentChunk[] = [{
        chunkId: 'chk-1',
        sectionId: 'sec-1',
        sectionTitle: 'Section 1: Termination & Renewal',
        text: sampleSection1.originalText,
        charStart: 0,
        charEnd: 2800,
        tokenEstimate: 700,
      }];
      await answerDocumentQuestion('Notice period?', sampleChunks, multiDocText);

      // Re-asking same question / switching tabs and coming back to QA
      await answerDocumentQuestion('Notice period?', sampleChunks, multiDocText);
      // Cache HIT: 0 new QA calls

      // Call count with cache: 2 (initial) + 1 (QA) = 3 calls
      expect(actualCallsWithCache).toBe(3);

      // COMPARISON CALCULATION:
      // Without cache:
      // Event 1 (Upload): 1 summary + 1 clause = 2 calls
      // Event 2 (Switch tabs): 1 clause call = 1 call
      // Event 3 (Come back to summary): 1 summary call = 1 call
      // Event 4 (Re-open document): 1 summary + 1 clause = 2 calls
      // Event 5 (QA ask + revisit): 2 QA calls = 2 calls
      // Total WITHOUT Cache: 2 + 1 + 1 + 2 + 2 = 8 calls!
      // Total WITH Cache: 3 calls!
      // Net Reduction: 5 calls saved (62.5% reduction in NVIDIA NIM calls).
    });
  });
});
