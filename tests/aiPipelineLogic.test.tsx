import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectAndClassifyClauses } from '@/lib/ai/analyzeClauses';
import { generateDocumentSummary, batchDocumentSections } from '@/lib/ai/analyzeDocument';
import { compareTwoDocuments } from '@/lib/ai/compareDocuments';
import { CLAUSE_DETECTION_PROMPT } from '@/lib/prompts/clauses';
import { DOCUMENT_SUMMARY_PROMPT } from '@/lib/prompts/summary';
import { DOCUMENT_COMPARE_PROMPT } from '@/lib/prompts/compare';
import { DocumentSection } from '@/types/document';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('AI Pipeline Core Logic & Resilience Tests', () => {
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'nvapi-unit-test-mock-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NVIDIA_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  function mockNvidiaCompletion(content: string | object) {
    const rawString = typeof content === 'string' ? content : JSON.stringify(content);
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: rawString,
            },
          },
        ],
      }),
    });
  }

  // ==========================================
  // 1. analyzeClauses.ts
  // ==========================================
  describe('detectAndClassifyClauses (analyzeClauses.ts)', () => {
    const sampleSections: DocumentSection[] = [
      {
        id: 'sec-term',
        title: 'Section 4: Termination',
        originalText: 'Either party may terminate this agreement upon 30 days prior written notice.',
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 0,
        endIndex: 76,
      },
      {
        id: 'sec-indem',
        title: 'Section 8: Indemnification',
        originalText: 'Vendor shall indemnify Customer against all claims, losses, and damages without limit.',
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 77,
        endIndex: 163,
      },
    ];

    const sampleDocText = sampleSections.map((s) => s.originalText).join('\n\n');

    it('prompt construction: generates prompt containing expected 8 categories, strict requirements, and verbatim text', async () => {
      const fetchMock = mockNvidiaCompletion({ clauses: [] });
      global.fetch = fetchMock;

      await detectAndClassifyClauses(sampleDocText, sampleSections);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      const payload = JSON.parse(options.body as string);
      const userMessage = payload.messages.find((m: any) => m.role === 'user')?.content;

      // Verify prompt instructions
      expect(userMessage).toContain('obligations (mandatory duties');
      expect(userMessage).toContain('deadlines (specific timeframes');
      expect(userMessage).toContain('penalties (late fees');
      expect(userMessage).toContain('auto-renewal (automatic extension');
      expect(userMessage).toContain('liability (caps on damages');
      expect(userMessage).toContain('indemnity (hold-harmless clauses');
      expect(userMessage).toContain('termination (for cause');
      expect(userMessage).toContain('other (governing law');
      expect(userMessage).toContain('Respond with ONLY a single valid JSON object');
      expect(userMessage).toContain('Quotes MUST be verbatim excerpts');
      expect(userMessage).toContain(sampleDocText);
    });

    it('prompt construction: chunks documents exceeding target chunk size into multiple chunk requests', async () => {
      // Create multi-section document exceeding CLAUSE_SINGLE_PASS_CHARS (22,000 chars)
      // to exercise the structured chunking path. 4 sections × ~6,000 chars each = ~24,000 chars.
      const largeSections: DocumentSection[] = Array.from({ length: 4 }, (_, i) => ({
        id: `sec-${i + 1}`,
        title: `Article ${i + 1}: General Terms`,
        originalText: `This is substantive legal text for section ${i + 1}. `.repeat(120), // ~6,480 chars each
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: i * 6600,
        endIndex: (i + 1) * 6600,
      }));
      const fullLargeText = largeSections.map((s) => s.originalText).join('\n\n');

      // Verify we are actually above the single-pass threshold
      expect(fullLargeText.length).toBeGreaterThan(22000);

      const fetchMock = mockNvidiaCompletion({ clauses: [] });
      global.fetch = fetchMock;

      await detectAndClassifyClauses(fullLargeText, largeSections);

      // Should have generated multiple chunk completion calls
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Each call payload should contain valid structured prompt with chunk text
      for (const call of fetchMock.mock.calls) {
        const payload = JSON.parse(call[1].body as string);
        const userMessage = payload.messages.find((m: any) => m.role === 'user')?.content;
        expect(userMessage).toContain('Analyze the provided legal document and extract all important clauses');
        expect(userMessage.length).toBeLessThan(60000);
      }
    });

    it('response handling: correctly processes valid clauses, links quotes, and maps lawyer checklist', async () => {
      const mockResponse = {
        clauses: [
          {
            category: 'termination',
            attentionLevel: 'high',
            title: '30-Day Termination Window',
            reason: 'Requires written notice 30 days in advance.',
            plainLanguageExplanation: 'You must provide 30 days notice to exit.',
            sourceSection: 'Termination',
            quote: 'Either party may terminate this agreement upon 30 days prior written notice.',
            questionForLawyer: 'Can we shorten the notice window to 15 days?',
          },
          {
            category: 'indemnity',
            attentionLevel: 'high',
            title: 'Unlimited Indemnity Exposure',
            reason: 'Vendor indemnifies Customer without financial cap.',
            plainLanguageExplanation: 'You are liable for all customer claims without any dollar limit.',
            sourceSection: 'Indemnification',
            quote: 'Vendor shall indemnify Customer against all claims, losses, and damages without limit.',
            questionForLawyer: 'Can we cap indemnity liability to total fees paid?',
          },
          {
            category: 'other',
            attentionLevel: 'low',
            title: 'Standard Notice Manner',
            reason: 'Requires written notice by email or mail.',
            plainLanguageExplanation: 'Notices must be in writing.',
            sourceSection: 'Termination',
            quote: 'written notice.',
            questionForLawyer: 'Is email notification acceptable?',
          },
        ],
      };

      const fetchMock = mockNvidiaCompletion(mockResponse);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(sampleDocText, sampleSections);

      expect(result.clauses).toHaveLength(3);

      // Verify clause properties
      const terminationClause = result.clauses[0];
      expect(terminationClause.id).toBe('clause-1');
      expect(terminationClause.category).toBe('termination');
      expect(terminationClause.attentionLevel).toBe('high');
      expect(terminationClause.sourceSection).toBe('Section 4: Termination');

      // Verify lawyer checklist items
      expect(result.lawyerChecklist).toHaveLength(3);
      // High attention maps to 'negotiation'
      expect(result.lawyerChecklist[0].type).toBe('negotiation');
      expect(result.lawyerChecklist[0].text).toBe('Can we shorten the notice window to 15 days?');
      // Low attention maps to 'question'
      expect(result.lawyerChecklist[2].type).toBe('question');

      // Verify section flag counts
      const termSection = result.updatedSections.find((s) => s.id === 'sec-term');
      expect(termSection?.flagCount).toEqual({ low: 1, medium: 0, high: 1 });

      const indemSection = result.updatedSections.find((s) => s.id === 'sec-indem');
      expect(indemSection?.flagCount).toEqual({ low: 0, medium: 0, high: 1 });
    });

    it('response handling: handles markdown fenced JSON (```json ... ```)', async () => {
      const fencedResponse =
        '```json\n{\n  "clauses": [\n    {\n      "category": "liability",\n      "attentionLevel": "medium",\n      "title": "Liability Cap",\n      "reason": "Caps liability",\n      "plainLanguageExplanation": "Liability is capped",\n      "sourceSection": "Liability",\n      "quote": "test quote",\n      "questionForLawyer": "Is this standard?"\n    }\n  ]\n}\n```';

      const fetchMock = mockNvidiaCompletion(fencedResponse);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(sampleDocText, sampleSections);
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0].title).toBe('Liability Cap');
    });

    it('response handling: handles smart quotes in model JSON output', async () => {
      // String with curly double and single quotes
      const smartQuoteResponse =
        '{\n  “clauses”: [\n    {\n      “category”: “obligations”,\n      “attentionLevel”: “medium”,\n      “title”: “Reporting ‘Weekly’ Status”,\n      “reason”: “Mandatory weekly reports”,\n      “plainLanguageExplanation”: “Must send weekly updates”,\n      “sourceSection”: “General”,\n      “quote”: “weekly status”,\n      “questionForLawyer”: “Can we report bi-weekly?”\n    }\n  ]\n}';

      const fetchMock = mockNvidiaCompletion(smartQuoteResponse);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(sampleDocText, sampleSections);
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0].title).toContain('Weekly');
    });

    it('response handling: recovers truncated JSON via jsonrepair', async () => {
      // JSON cut off at the end (unclosed brackets)
      const truncatedResponse =
        '{\n  "clauses": [\n    {\n      "category": "penalties",\n      "attentionLevel": "high",\n      "title": "Late Fee",\n      "reason": "10% surcharge",\n      "plainLanguageExplanation": "10% penalty for late payments",\n      "sourceSection": "Payment",\n      "quote": "10% fee",\n      "questionForLawyer": "Can we cap the fee?"\n    }\n  ]';

      const fetchMock = mockNvidiaCompletion(truncatedResponse);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(sampleDocText, sampleSections);
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0].title).toBe('Late Fee');
    });

    it('edge case: handles empty document text and empty clauses response without error', async () => {
      const fetchMock = mockNvidiaCompletion({ clauses: [] });
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses('', []);
      expect(result.clauses).toEqual([]);
      expect(result.lawyerChecklist).toEqual([]);
      expect(result.updatedSections).toEqual([]);
    });

    it('edge case: unverified quotes not in text are sliced to 200 characters without throwing', async () => {
      const hallucinatedLongQuote = 'Z'.repeat(500);
      const mockResponse = {
        clauses: [
          {
            category: 'other',
            attentionLevel: 'low',
            title: 'Invented Term',
            reason: 'Reason',
            plainLanguageExplanation: 'Explanation',
            sourceSection: 'Unknown',
            quote: hallucinatedLongQuote,
            questionForLawyer: 'Question',
          },
        ],
      };

      const fetchMock = mockNvidiaCompletion(mockResponse);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(sampleDocText, sampleSections);
      expect(result.clauses).toHaveLength(1);
      // Sliced to 200 chars because quote was not in text
      expect(result.clauses[0].quote).toHaveLength(200);
    });
  });

  // ==========================================
  // 2. analyzeDocument.ts
  // ==========================================
  describe('generateDocumentSummary (analyzeDocument.ts)', () => {
    const sampleSections: DocumentSection[] = [
      {
        id: 'sec-parties',
        title: 'Parties',
        originalText: 'This agreement is between Alpha Corp and Beta LLC.',
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 0,
        endIndex: 50,
      },
      {
        id: 'sec-term',
        title: 'Term',
        originalText: 'The term shall be 24 months starting March 1, 2026.',
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 51,
        endIndex: 102,
      },
    ];

    it('prompt construction: formats sections input with IDs and titles', async () => {
      const fetchMock = mockNvidiaCompletion({
        overview: 'Overview',
        documentType: 'Agreement',
        mainParties: ['Alpha Corp', 'Beta LLC'],
        effectiveDateOrTerm: '24 months',
        keyTakeaways: ['24-month term'],
        sectionSummaries: [],
        disclaimer: LEGAL_DISCLAIMER,
      });
      global.fetch = fetchMock;

      await generateDocumentSummary(sampleSections);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      const payload = JSON.parse(options.body as string);
      const userMessage = payload.messages.find((m: any) => m.role === 'user')?.content;

      expect(userMessage).toContain('### SECTION ID: sec-parties');
      expect(userMessage).toContain('TITLE: Parties');
      expect(userMessage).toContain('### SECTION ID: sec-term');
      expect(userMessage).toContain('TITLE: Term');
    });

    it('response handling: updates sections with summaries and extracts summary metadata', async () => {
      const mockSummaryData = {
        overview: 'Commercial supply agreement for 24 months.',
        documentType: 'Supply Agreement',
        mainParties: ['Alpha Corp', 'Beta LLC'],
        effectiveDateOrTerm: '24 months starting March 1, 2026',
        keyTakeaways: ['Two-year term', 'Exclusive supplier arrangement'],
        sectionSummaries: [
          {
            sectionId: 'sec-parties',
            plainLanguageSummary: 'Names Alpha Corp and Beta LLC as the contracting entities.',
            keyPoints: ['Alpha Corp is buyer', 'Beta LLC is supplier'],
          },
          // Intentionally omitting sec-term to test fallback
        ],
        disclaimer: LEGAL_DISCLAIMER,
      };

      const fetchMock = mockNvidiaCompletion(mockSummaryData);
      global.fetch = fetchMock;

      const { summary, updatedSections } = await generateDocumentSummary(sampleSections);

      // 1. Verify summary fields
      expect(summary.documentType).toBe('Supply Agreement');
      expect(summary.overview).toContain('Commercial supply agreement');
      expect(summary.mainParties).toEqual(['Alpha Corp', 'Beta LLC']);
      expect(summary.effectiveDateOrTerm).toBe('24 months starting March 1, 2026');
      expect(summary.disclaimer).toBe(LEGAL_DISCLAIMER);

      // 2. Verify section 1 received mapped summary
      const sec1 = updatedSections.find((s) => s.id === 'sec-parties');
      expect(sec1?.plainLanguageSummary).toBe(
        'Names Alpha Corp and Beta LLC as the contracting entities.'
      );
      expect(sec1?.keyPoints).toHaveLength(2);

      // 3. Verify section 2 received fallback summary
      const sec2 = updatedSections.find((s) => s.id === 'sec-term');
      expect(sec2?.plainLanguageSummary).toBe('This section covers term.');
      expect(sec2?.keyPoints).toEqual([]);
    });

    it('edge case: handles empty sections array without error', async () => {
      const fetchMock = mockNvidiaCompletion({
        overview: 'Empty document',
        documentType: 'General Document',
        mainParties: [],
        effectiveDateOrTerm: '',
        keyTakeaways: [],
        sectionSummaries: [],
        disclaimer: LEGAL_DISCLAIMER,
      });
      global.fetch = fetchMock;

      const { summary, updatedSections } = await generateDocumentSummary([]);
      expect(summary.overview).toBe('Empty document');
      expect(updatedSections).toEqual([]);
    });

    it('batching helper: groups sections respecting max count and character thresholds', () => {
      const fiveSections: DocumentSection[] = Array.from({ length: 5 }, (_, i) => ({
        id: `sec-${i + 1}`,
        title: `Section ${i + 1}`,
        originalText: `This is text for section ${i + 1} with some characters.`,
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: i * 50,
        endIndex: (i + 1) * 50,
      }));

      // With maxCount=2 override: 5 sections -> batches of [2, 2, 1]
      const batches = batchDocumentSections(fiveSections, 3500, 2);
      expect(batches).toHaveLength(3); // 2 + 2 + 1
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toHaveLength(2);
      expect(batches[2]).toHaveLength(1);
    });

    it('single-pass: documents under SINGLE_PASS_MAX_CHARS (50k chars) run in exactly 1 LLM call regardless of section count', async () => {
      // 4 sections, each ~50 chars total, well under 50,000-char threshold -> single-pass
      const multiSections: DocumentSection[] = Array.from({ length: 4 }, (_, i) => ({
        id: `sec-${i + 1}`,
        title: `Section ${i + 1}`,
        originalText: `Substantive legal content for section ${i + 1}.`,
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: i * 100,
        endIndex: (i + 1) * 100,
      }));

      const mockSinglePassResponse = {
        overview: 'Synthesized contract summary from all 4 sections in one pass.',
        documentType: 'Commercial Contract',
        mainParties: ['Party A', 'Party B'],
        effectiveDateOrTerm: '12 months',
        keyTakeaways: ['Key takeaway from single-pass analysis'],
        sectionSummaries: [
          { sectionId: 'sec-1', plainLanguageSummary: 'Summary 1', keyPoints: ['Pt 1'] },
          { sectionId: 'sec-2', plainLanguageSummary: 'Summary 2', keyPoints: ['Pt 2'] },
          { sectionId: 'sec-3', plainLanguageSummary: 'Summary 3', keyPoints: ['Pt 3'] },
          { sectionId: 'sec-4', plainLanguageSummary: 'Summary 4', keyPoints: ['Pt 4'] },
        ],
        disclaimer: LEGAL_DISCLAIMER,
      };

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(mockSinglePassResponse) } }] }),
      });

      global.fetch = fetchMock;

      const { summary, updatedSections } = await generateDocumentSummary(multiSections);

      // Exactly 1 LLM call — no batching, no synthesis round-trip
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(summary.documentType).toBe('Commercial Contract');
      expect(summary.overview).toContain('4 sections in one pass');
      expect(updatedSections).toHaveLength(4);
      expect(updatedSections[0].plainLanguageSummary).toBe('Summary 1');
      expect(updatedSections[3].plainLanguageSummary).toBe('Summary 4');
    });
  });

  // ==========================================
  // 3. compareDocuments.ts
  // ==========================================
  describe('compareTwoDocuments (compareDocuments.ts)', () => {
    it('prompt construction: builds prompt with neutral guardrails and document excerpts', async () => {
      const fetchMock = mockNvidiaCompletion({
        summaryOverview: 'Comparison summary',
        materialChanges: [],
        disclaimer: LEGAL_DISCLAIMER,
      });
      global.fetch = fetchMock;

      await compareTwoDocuments(
        'Contract A 2025',
        'Original liability cap: $500,000.',
        'Contract B 2026',
        'Revised liability cap: $1,000,000.'
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      const payload = JSON.parse(options.body as string);
      const userMessage = payload.messages.find((m: any) => m.role === 'user')?.content;

      expect(userMessage).toContain('Contract A 2025');
      expect(userMessage).toContain('Original liability cap: $500,000.');
      expect(userMessage).toContain('Contract B 2026');
      expect(userMessage).toContain('Revised liability cap: $1,000,000.');
      expect(userMessage).toContain('Do NOT make any recommendation');
      expect(userMessage).toContain('Do NOT describe either version as "better" or "worse"');
    });

    it('prompt construction: slices documents exceeding 25,000 characters', async () => {
      const textA = 'A'.repeat(30000);
      const textB = 'B'.repeat(30000);

      const fetchMock = mockNvidiaCompletion({
        summaryOverview: 'Overview',
        materialChanges: [],
        disclaimer: LEGAL_DISCLAIMER,
      });
      global.fetch = fetchMock;

      await compareTwoDocuments('Doc A', textA, 'Doc B', textB);

      const [, options] = fetchMock.mock.calls[0];
      const payload = JSON.parse(options.body as string);
      const userMessage = payload.messages.find((m: any) => m.role === 'user')?.content;

      // Assert capped at 25,000 chars each
      expect(userMessage).toContain('A'.repeat(25000));
      expect(userMessage).not.toContain('A'.repeat(25001));
      expect(userMessage).toContain('B'.repeat(25000));
      expect(userMessage).not.toContain('B'.repeat(25001));
    });

    it('response handling: assigns sequential diff IDs and preserves material change objects', async () => {
      const mockCompareOutput = {
        summaryOverview: 'Doc B doubles the liability cap and shortens notice from 30 to 15 days.',
        materialChanges: [
          {
            title: 'Increased Liability Cap',
            type: 'modified',
            attentionLevel: 'high',
            plainLanguageExplanation: 'Liability cap increased from $500K to $1M.',
            sourceDocA: { sectionTitle: 'Section 6 - Liability', quote: '$500,000' },
            sourceDocB: { sectionTitle: 'Section 6 - Liability', quote: '$1,000,000' },
          },
          {
            title: 'Shortened Notice Window',
            type: 'modified',
            attentionLevel: 'medium',
            plainLanguageExplanation: 'Termination notice shortened from 30 to 15 days.',
            sourceDocA: { sectionTitle: 'Section 9 - Termination', quote: '30 days' },
            sourceDocB: { sectionTitle: 'Section 9 - Termination', quote: '15 days' },
          },
        ],
        disclaimer: LEGAL_DISCLAIMER,
      };

      const fetchMock = mockNvidiaCompletion(mockCompareOutput);
      global.fetch = fetchMock;

      const diffResult = await compareTwoDocuments(
        'Original NDA',
        '30 days notice',
        'Revised NDA',
        '15 days notice'
      );

      expect(diffResult.docAName).toBe('Original NDA');
      expect(diffResult.docBName).toBe('Revised NDA');
      expect(diffResult.materialChanges).toHaveLength(2);
      expect(diffResult.materialChanges[0].id).toBe('diff-1');
      expect(diffResult.materialChanges[1].id).toBe('diff-2');
      expect(diffResult.materialChanges[0].type).toBe('modified');
      expect(diffResult.disclaimer).toBe(LEGAL_DISCLAIMER);
    });

    it('response normalization: handles model returning an array directly instead of object wrapper', async () => {
      const rawArrayResponse = [
        {
          title: 'Removed Audit Rights',
          type: 'removed',
          attentionLevel: 'high',
          plainLanguageExplanation: 'Customer inspection and audit rights were deleted.',
          sourceDocA: { sectionTitle: 'Section 12 - Audit', quote: 'Customer may inspect books annually.' },
          sourceDocB: { sectionTitle: 'Not present in Doc B', quote: '' },
        },
      ];

      const fetchMock = mockNvidiaCompletion(rawArrayResponse);
      global.fetch = fetchMock;

      const diffResult = await compareTwoDocuments('Doc A', 'Audit text', 'Doc B', 'No audit');

      expect(diffResult.summaryOverview).toBe('Comparison completed. Review the material changes below.');
      expect(diffResult.materialChanges).toHaveLength(1);
      expect(diffResult.materialChanges[0].title).toBe('Removed Audit Rights');
      expect(diffResult.materialChanges[0].id).toBe('diff-1');
    });

    it('response normalization: injects missing disclaimer if omitted by model', async () => {
      const responseWithoutDisclaimer = {
        summaryOverview: 'Overview text without disclaimer',
        materialChanges: [],
      };

      const fetchMock = mockNvidiaCompletion(responseWithoutDisclaimer);
      global.fetch = fetchMock;

      const diffResult = await compareTwoDocuments('Doc A', 'Text A', 'Doc B', 'Text B');
      expect(diffResult.disclaimer).toBe(LEGAL_DISCLAIMER);
    });
  });
});
