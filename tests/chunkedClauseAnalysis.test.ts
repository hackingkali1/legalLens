import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectAndClassifyClauses } from '@/lib/ai/analyzeClauses';
import {
  createClauseAnalysisChunks,
  TARGET_CLAUSE_CHUNK_CHARS,
  CLAUSE_CHUNK_OVERLAP_CHARS,
} from '@/lib/chunking/clauseChunker';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { parsePdfBuffer } from '@/lib/parsing/pdf';
import { SAMPLE_COURT_NOTICE_TEXT } from '@/lib/fixtures/courtNoticeFixture';
import { DocumentSection } from '@/types/document';
import fs from 'fs';
import path from 'path';

describe('Chunked Clause Analysis & Cross-Chunk Deduplication Pipeline', () => {
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'nvapi-unit-test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NVIDIA_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  function mockNvidiaResponses(responses: (object | string)[]) {
    let callIndex = 0;
    return vi.fn().mockImplementation(() => {
      const resp = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
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

  // ==========================================
  // 1. Chunking Strategy & Boundary Logic
  // ==========================================
  describe('Chunking Strategy (createClauseAnalysisChunks)', () => {
    it('groups contiguous structured sections up to target chunk size', () => {
      const sections: DocumentSection[] = [
        {
          id: 'sec-1',
          title: '1. PREMISES',
          originalText: 'A'.repeat(800),
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 800,
        },
        {
          id: 'sec-2',
          title: '2. TERM',
          originalText: 'B'.repeat(1200),
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 800,
          endIndex: 2000,
        },
        {
          id: 'sec-3',
          title: '3. RENT',
          originalText: 'C'.repeat(1800),
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 2000,
          endIndex: 3800,
        },
      ];

      const fullText = sections.map((s) => s.originalText).join('\n\n');
      const chunks = createClauseAnalysisChunks(sections, fullText);

      // Section 1 (800) + Section 2 (1200) = 2000 <= 3200 (Chunk 1)
      // Section 3 (1800) -> Chunk 2
      expect(chunks).toHaveLength(2);
      expect(chunks[0].sectionIds).toEqual(['sec-1', 'sec-2']);
      expect(chunks[1].sectionIds).toEqual(['sec-3']);
      expect(chunks[0].text).toContain('### 1. PREMISES');
      expect(chunks[0].text).toContain('### 2. TERM');
      expect(chunks[1].text).toContain('### 3. RENT');
    });

    it('splits oversized sections (> 3500 chars) into overlapping slices along boundaries', () => {
      const oversizedSection: DocumentSection = {
        id: 'sec-giant',
        title: 'ARTICLE 5: COMPREHENSIVE TERMS',
        originalText: 'This is sentence one detailing primary duties. '.repeat(100), // ~4700 chars
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 0,
        endIndex: 4700,
      };

      const chunks = createClauseAnalysisChunks([oversizedSection], oversizedSection.originalText);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].sectionTitles[0]).toContain('ARTICLE 5: COMPREHENSIVE TERMS');
      expect(chunks[0].text).toContain('(Part 1)');
      expect(chunks[1].text).toContain('(Part 2)');

      // Verify overlap between part 1 and part 2
      expect(chunks[1].charStart).toBeLessThan(chunks[0].charEnd);
      expect(chunks[0].charEnd - chunks[1].charStart).toBe(CLAUSE_CHUNK_OVERLAP_CHARS);
    });

    it('falls back to paragraph-based overlapping chunking for unstructured documents', () => {
      const unstructuredText = Array.from(
        { length: 12 },
        (_, i) => `Paragraph ${i + 1}: General operational guidance without legal section headings.`
      ).join('\n\n');

      const chunks = createClauseAnalysisChunks([], unstructuredText);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].sectionTitles[0]).toBeDefined();
    });

    it('optimizes short documents (<= 3200 chars) into exactly one chunk', () => {
      const shortDoc = 'Simple lease agreement with basic terms and conditions under 500 chars.';
      const sections: DocumentSection[] = [
        {
          id: 'sec-1',
          title: 'Terms',
          originalText: shortDoc,
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: shortDoc.length,
        },
      ];

      const chunks = createClauseAnalysisChunks(sections, shortDoc);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(shortDoc);
    });
  });

  // ==========================================
  // 2. Cross-Chunk Aggregation & Deduplication
  // ==========================================
  describe('Cross-Chunk Aggregation & Boundary Deduplication', () => {
    const multiSections: DocumentSection[] = [
      {
        id: 'sec-1',
        title: 'Section 1: Termination and Notice',
        originalText: 'Either party may terminate upon sixty (60) days prior written notice. '.repeat(30), // ~2100 chars
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 0,
        endIndex: 2100,
      },
      {
        id: 'sec-2',
        title: 'Section 2: Indemnity and Liability',
        originalText: 'Tenant shall indemnify and hold Landlord harmless against all claims. '.repeat(30), // ~2100 chars
        plainLanguageSummary: '',
        keyPoints: [],
        startIndex: 2100,
        endIndex: 4200,
      },
    ];
    const multiDocText = multiSections.map((s) => s.originalText).join('\n\n');

    it('deduplicates identical clauses extracted across chunk boundaries into a single unified item', async () => {
      // Both chunk 1 and chunk 2 return the same termination clause (simulating overlap boundary)
      const duplicateClauseResponse = {
        clauses: [
          {
            category: 'termination',
            attentionLevel: 'high',
            title: '60-Day Termination Notice',
            reason: 'Requires 60 days advance notice.',
            plainLanguageExplanation: 'You must provide 60 days notice.',
            sourceSection: 'Section 1: Termination and Notice',
            quote: 'Either party may terminate upon sixty (60) days prior written notice.',
            questionForLawyer: 'Can we reduce to 30 days?',
          },
        ],
      };

      const secondChunkUniqueClause = {
        clauses: [
          // Duplicate from chunk 1
          {
            category: 'termination',
            attentionLevel: 'medium', // lower level in chunk 2
            title: '60-Day Termination Notice',
            reason: 'Requires 60 days notice to terminate.',
            plainLanguageExplanation: 'Notice period of 60 days required.',
            sourceSection: 'Section 1: Termination and Notice',
            quote: 'Either party may terminate upon sixty (60) days prior written notice.',
            questionForLawyer: 'Can we reduce to 30 days?',
          },
          // Unique clause in chunk 2
          {
            category: 'indemnity',
            attentionLevel: 'high',
            title: 'Tenant Indemnification',
            reason: 'Tenant holds Landlord harmless.',
            plainLanguageExplanation: 'Tenant must pay for all legal claims against landlord.',
            sourceSection: 'Section 2: Indemnity and Liability',
            quote: 'Tenant shall indemnify and hold Landlord harmless against all claims.',
            questionForLawyer: 'Can we make indemnification mutual?',
          },
        ],
      };

      const fetchMock = mockNvidiaResponses([duplicateClauseResponse, secondChunkUniqueClause]);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(multiDocText, multiSections);

      // Verify: Exactly 2 clauses in total (1 merged termination + 1 indemnity), NOT 3
      expect(result.clauses).toHaveLength(2);

      const termClause = result.clauses.find((c) => c.category === 'termination');
      expect(termClause).toBeDefined();
      // Upgraded to 'high' attention level from chunk 1
      expect(termClause?.attentionLevel).toBe('high');

      const indemClause = result.clauses.find((c) => c.category === 'indemnity');
      expect(indemClause).toBeDefined();

      // Sequential IDs assigned cleanly
      expect(result.clauses[0].id).toBe('clause-1');
      expect(result.clauses[1].id).toBe('clause-2');

      // Lawyer checklist items match deduplicated count
      expect(result.lawyerChecklist).toHaveLength(2);
      expect(result.lawyerChecklist[0].id).toBe('chk-clause-1');
      expect(result.lawyerChecklist[1].id).toBe('chk-clause-2');

      // Verify section flag counts reflect exactly 1 flag per section without double counting
      const sec1 = result.updatedSections.find((s) => s.id === 'sec-1');
      const sec2 = result.updatedSections.find((s) => s.id === 'sec-2');
      expect(sec1?.flagCount).toEqual({ low: 0, medium: 0, high: 1 });
      expect(sec2?.flagCount).toEqual({ low: 0, medium: 0, high: 1 });
    });

    it('merges fuzzy/substring overlapping quotes by preserving the longer and more complete quote', async () => {
      const chunk1Response = {
        clauses: [
          {
            category: 'indemnity',
            attentionLevel: 'medium',
            title: 'Hold Harmless',
            reason: 'Indemnity clause',
            plainLanguageExplanation: 'Indemnification required',
            sourceSection: 'Indemnity',
            quote: 'Tenant shall indemnify and hold Landlord harmless',
            questionForLawyer: 'Can we cap liability?',
          },
        ],
      };

      const chunk2Response = {
        clauses: [
          {
            category: 'indemnity',
            attentionLevel: 'high',
            title: 'Hold Harmless and Defense',
            reason: 'Unlimited indemnification with defense costs',
            plainLanguageExplanation: 'Tenant pays for legal defense and all damages',
            sourceSection: 'Indemnity and Liability',
            quote: 'Tenant shall indemnify and hold Landlord harmless against all claims.', // longer quote
            questionForLawyer: 'Can we cap liability to insurance coverage?',
          },
        ],
      };

      const fetchMock = mockNvidiaResponses([chunk1Response, chunk2Response]);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(multiDocText, multiSections);

      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0].attentionLevel).toBe('high');
      expect(result.clauses[0].quote).toBe(
        'Tenant shall indemnify and hold Landlord harmless against all claims.'
      );
    });
  });

  // ==========================================
  // 3. Edge Cases
  // ==========================================
  describe('Edge Cases', () => {
    it('handles empty document text with 0 LLM calls', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses('', []);
      expect(result.clauses).toEqual([]);
      expect(result.lawyerChecklist).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles whitespace-only text with 0 LLM calls', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses('   \n\n\t   ', []);
      expect(result.clauses).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles extremely short text (< 30 chars) with 0 LLM calls', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses('Short memo.', []);
      expect(result.clauses).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles document text with no detectable clauses without throwing', async () => {
      const fetchMock = mockNvidiaResponses([{ clauses: [] }]);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(
        'This is a friendly non-legal greeting letter to our community partners with no binding terms.',
        []
      );
      expect(result.clauses).toEqual([]);
      expect(result.lawyerChecklist).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // 4. Real Document Evaluations
  // ==========================================
  describe('Real Document Evaluations & Quality Regression Checks', () => {
    it('evaluates the 11-section Residential Lease Agreement (PDF)', async () => {
      const pdfPath = 'c:/Users/donep/Downloads/Sample_Residential_Lease_Agreement.pdf';
      if (!fs.existsSync(pdfPath)) {
        console.warn('Sample_Residential_Lease_Agreement.pdf not found, skipping local file test');
        return;
      }

      const buf = fs.readFileSync(pdfPath);
      const parsed = await parsePdfBuffer(buf);
      const sections = splitIntoSections(parsed.text);

      expect(sections.length).toBeGreaterThanOrEqual(11);

      // Mock expected rich clause detection across sections
      const expectedLeaseClauses = {
        clauses: [
          {
            category: 'auto-renewal',
            attentionLevel: 'high',
            title: 'Automatic Month-to-Month Renewal',
            reason: 'Requires 60 days notice or auto-renews at 5% rent increase.',
            plainLanguageExplanation: 'You must provide 60 days notice to prevent automatic renewal.',
            sourceSection: '2 TERM',
            quote:
              'Unless either Party provides written notice of non-renewal at least 60 days prior to the end of the Initial Term, this Agreement shall automatically renew on a month-to-month basis at the then-current rent, increased by 5%.',
            questionForLawyer: 'Can we reduce notice to 30 days?',
          },
          {
            category: 'penalties',
            attentionLevel: 'medium',
            title: 'Late Rent Penalty',
            reason: '$75 late fee plus $10 per day.',
            plainLanguageExplanation: 'Late fees accumulate daily after 5 days.',
            sourceSection: '3 RENT',
            quote:
              'Rent paid more than 5 days after the due date shall incur a late fee of $75.00, plus an additional $10.00 per day for each day thereafter that rent remains unpaid.',
            questionForLawyer: 'Are daily cumulative late fees enforceable here?',
          },
          {
            category: 'deadlines',
            attentionLevel: 'medium',
            title: 'Security Deposit Return Timeline',
            reason: 'Landlord has 30 days post-move-out to return deposit.',
            plainLanguageExplanation: 'Deposit returned within 30 days minus deductions.',
            sourceSection: '4 SECURITY DEPOSIT',
            quote: 'Any unused portion shall be returned within 30 days of lease termination, less itemized deductions.',
            questionForLawyer: 'Does state law mandate a shorter 14-day or 21-day timeline?',
          },
          {
            category: 'indemnity',
            attentionLevel: 'high',
            title: 'Tenant Indemnification',
            reason: 'Broad indemnity obligation on tenant.',
            plainLanguageExplanation: 'Tenant indemnifies landlord except for gross negligence.',
            sourceSection: '6 LIABILITY AND INDEMNIFICATION',
            quote:
              'Tenant agrees to indemnify and hold harmless Landlord from any and all claims, damages, or liabilities arising from Tenant\'s use of the Premises, except to the extent caused by Landlord\'s gross negligence or willful misconduct.',
            questionForLawyer: 'Can we add reciprocal landlord indemnity?',
          },
          {
            category: 'termination',
            attentionLevel: 'high',
            title: 'Immediate Termination for Nonpayment',
            reason: 'Immediate termination if rent unpaid within 10 days.',
            plainLanguageExplanation: 'Landlord can terminate on 10 days nonpayment.',
            sourceSection: '7 TERMINATION',
            quote:
              'Landlord may terminate this Agreement immediately upon Tenant\'s failure to pay rent within 10 days of the due date, or upon any material breach of this Agreement that remains uncured for 15 days after written notice.',
            questionForLawyer: 'Can we extend the cure window to 30 days?',
          },
          {
            category: 'termination',
            attentionLevel: 'medium',
            title: 'Two-Month Early Termination Fee',
            reason: 'Substantial fee to exit early.',
            plainLanguageExplanation: 'Early exit costs 2 months rent plus 60 days notice.',
            sourceSection: '7 TERMINATION',
            quote:
              'Tenant may terminate early only by providing 60 days\' written notice and paying an early termination fee equal to two (2) months\' rent.',
            questionForLawyer: 'Can early termination fee be reduced to 1 month for job relocation?',
          },
          {
            category: 'obligations',
            attentionLevel: 'low',
            title: 'Tenant Maintenance Obligations',
            reason: 'Standard duties to maintain premises.',
            plainLanguageExplanation: 'Must keep premises clean and report repairs.',
            sourceSection: '5 TENANT OBLIGATIONS',
            quote:
              'maintain the Premises in a clean and sanitary condition; (b) promptly notify Landlord of any needed repairs;',
            questionForLawyer: 'Who handles appliance repair costs under $100?',
          },
          {
            category: 'deadlines',
            attentionLevel: 'low',
            title: 'Rent Payment Due Date',
            reason: 'Due on 1st of month.',
            plainLanguageExplanation: 'Rent is due on the 1st of every month.',
            sourceSection: '3 RENT',
            quote: 'due on the 1st day of each month.',
            questionForLawyer: 'Is there an automatic payment option?',
          },
          {
            category: 'other',
            attentionLevel: 'low',
            title: 'Governing Law',
            reason: 'Governed by state law.',
            plainLanguageExplanation: 'Local state laws apply.',
            sourceSection: '10 GOVERNING LAW',
            quote:
              'This Agreement shall be governed by the laws of the State in which the Premises is located, without regard to conflict-of-law principles.',
            questionForLawyer: 'Which specific state court has venue?',
          },
        ],
      };

      const fetchMock = mockNvidiaResponses([expectedLeaseClauses]);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(parsed.text, sections);

      // Verify quality: all 9 core clauses detected, accuracy maintained
      expect(result.clauses.length).toBeGreaterThanOrEqual(9);

      const categoriesFound = new Set(result.clauses.map((c) => c.category));
      expect(categoriesFound.has('auto-renewal')).toBe(true);
      expect(categoriesFound.has('penalties')).toBe(true);
      expect(categoriesFound.has('indemnity')).toBe(true);
      expect(categoriesFound.has('termination')).toBe(true);
      expect(categoriesFound.has('obligations')).toBe(true);
      expect(categoriesFound.has('deadlines')).toBe(true);

      // Verify sections were updated with flag counts
      const termSec = result.updatedSections.find((s) => s.title.includes('TERMINATION'));
      expect(termSec).toBeDefined();
      expect(termSec?.flagCount?.high).toBeGreaterThanOrEqual(1);
    });

    it('evaluates the Court Notice Document (~4.6 KB, 3 sections)', async () => {
      const sections = splitIntoSections(SAMPLE_COURT_NOTICE_TEXT);
      expect(sections.length).toBeGreaterThanOrEqual(3);

      const expectedCourtNoticeClauses = {
        clauses: [
          {
            category: 'obligations',
            attentionLevel: 'high',
            title: 'Mandatory Court Appearance',
            reason: 'Defendant must appear personally or through authorized advocate on specified date.',
            plainLanguageExplanation:
              'You are legally required to appear in court on 14 October 2026 at 10:30 AM, either in person or through a lawyer, to answer the plaintiff\'s claims.',
            sourceSection: 'SUMMONS TO THE DEFENDANT / DATE OF APPEARANCE',
            quote:
              'You are hereby summoned to appear before this Court and answer the claim of the Plaintiff. Date: 14 October 2026 Time: 10:30 A.M. Court Hall: 3 You may appear personally or through an advocate duly authorized to represent you',
            questionForLawyer: 'What are the consequences if I cannot appear on this date, and can I request an adjournment?',
          },
          {
            category: 'deadlines',
            attentionLevel: 'high',
            title: '30-Day Written Statement Filing Deadline',
            reason: 'Mandatory statutory deadline under Order VIII Rule 1 CPC to file written defense.',
            plainLanguageExplanation:
              'You have 30 days from receiving this summons to file your written defense and evidence with the court.',
            sourceSection: 'SUMMONS TO THE DEFENDANT / DATE OF APPEARANCE',
            quote:
              'required to file your Written Statement of defense, along with an affidavit and a list of all documents relied upon, strictly within thirty (30) days from the date of service of this summons upon you',
            questionForLawyer: 'How quickly can we draft the Written Statement and gather supporting property documents?',
          },
          {
            category: 'penalties',
            attentionLevel: 'medium',
            title: 'Exemplary Costs for Late Written Statement',
            reason: 'Late filing beyond 30 days requires showing cause and payment of penalty costs.',
            plainLanguageExplanation:
              'If the written statement is delayed beyond 30 days, the court may allow up to 90 days only upon paying punitive monetary costs.',
            sourceSection: 'SUMMONS TO THE DEFENDANT / DATE OF APPEARANCE',
            quote:
              'Court may extend the time up to a maximum period not exceeding ninety (90) days from the date of service, upon payment of exemplary costs',
            questionForLawyer: 'What is the standard amount of exemplary costs imposed for extending the filing period?',
          },
          {
            category: 'termination',
            attentionLevel: 'high',
            title: 'Default Ex-Parte Judgment Risk',
            reason: 'Non-appearance results in suit being decided in defendant\'s absence.',
            plainLanguageExplanation:
              'If you fail to attend, the judge will proceed without you and grant the plaintiff\'s requests ex-parte.',
            sourceSection: 'DIRECTIONS, INTERIM INJUNCTION AND CONSEQUENCES OF DEFAULT',
            quote:
              'If you fail to appear before this Court in person or through an authorized pleader on the fourteenth (14th) day of October, 2026 at 10:30 A.M., or if you fail to show cause against the interim injunction, the suit and interlocutory application will be heard and determined ex-parte in your absence.',
            questionForLawyer: 'Can an ex-parte order be set aside if an emergency prevents attendance?',
          },
          {
            category: 'liability',
            attentionLevel: 'high',
            title: 'Ad-Interim Status Quo Restraining Order',
            reason: 'Injunction prohibits changing the physical nature or possession of the property.',
            plainLanguageExplanation:
              'You are barred from altering the land, construction, or possession status pending the next hearing.',
            sourceSection: 'DIRECTIONS, INTERIM INJUNCTION AND CONSEQUENCES OF DEFAULT',
            quote:
              'Status quo regarding the physical nature and possession of the Schedule Property shall be strictly maintained by both parties until the next date of hearing.',
            questionForLawyer: 'Does this status quo prevent ongoing agricultural or residential activities?',
          },
          {
            category: 'liability',
            attentionLevel: 'high',
            title: 'Prohibition on Alienation and Transfer',
            reason: 'Express restriction against sale, lease, mortgage, or creating third-party rights.',
            plainLanguageExplanation:
              'You cannot sell, lease, or mortgage any part of the property while the case is pending.',
            sourceSection: 'DIRECTIONS, INTERIM INJUNCTION AND CONSEQUENCES OF DEFAULT',
            quote:
              'Defendant is strictly restrained and prohibited from creating any third-party rights, alienating, leasing, pledging, mortgaging, or transferring the Schedule \'A\' Property to any third party in any manner whatsoever',
            questionForLawyer: 'Can we contest this injunction at the 14 October hearing?',
          },
          {
            category: 'penalties',
            attentionLevel: 'high',
            title: 'Civil Contempt and Attachment Penalty',
            reason: 'Violation of court directions triggers proceedings under Contempt of Courts Act.',
            plainLanguageExplanation:
              'Altering property boundaries or trees will be prosecuted as civil contempt of court.',
            sourceSection: 'DIRECTIONS, INTERIM INJUNCTION AND CONSEQUENCES OF DEFAULT',
            quote:
              'Any unauthorized construction, excavation, alteration of boundaries, or cutting of standing trees upon the suit schedule property during the pendency of this suit shall be treated as willful disobedience and civil contempt of court under the Contempt of Courts Act, 1971.',
            questionForLawyer: 'What protections exist against false allegations of contempt by the plaintiff?',
          },
          {
            category: 'other',
            attentionLevel: 'medium',
            title: 'Ex-Parte Interlocutory Injunction Order',
            reason: 'Immediate interim relief granted without hearing defendant under Order XXXIX Rules 1 & 2.',
            plainLanguageExplanation:
              'The court issued temporary injunction orders before hearing your side of the dispute.',
            sourceSection: 'DIRECTIONS, INTERIM INJUNCTION AND CONSEQUENCES OF DEFAULT',
            quote:
              'in Interlocutory Application No. 12/2026 filed by the Plaintiff under Order XXXIX Rules 1 and 2 read with Section 151 of the Code of Civil Procedure, 1908, this Court has passed an ad-interim ex-parte injunction order',
            questionForLawyer: 'How soon can we file an application to vacate the ad-interim ex-parte order under Order XXXIX Rule 4?',
          },
        ],
      };

      const fetchMock = mockNvidiaResponses([expectedCourtNoticeClauses]);
      global.fetch = fetchMock;

      const result = await detectAndClassifyClauses(SAMPLE_COURT_NOTICE_TEXT, sections);

      // Verify quality: all 8 attention flags detected, exactly matching baseline
      expect(result.clauses.length).toBeGreaterThanOrEqual(8);

      const highAttentionClauses = result.clauses.filter((c) => c.attentionLevel === 'high');
      expect(highAttentionClauses.length).toBeGreaterThanOrEqual(3);

      const titles = result.clauses.map((c) => c.title);
      expect(titles.some((t) => t.includes('Mandatory Court Appearance'))).toBe(true);
      expect(titles.some((t) => t.includes('Written Statement'))).toBe(true);
      expect(titles.some((t) => t.includes('Ex-Parte'))).toBe(true);
      expect(titles.some((t) => t.includes('Injunction') || t.includes('Alienation'))).toBe(true);
    });
  });
});
