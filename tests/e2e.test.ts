import { describe, it, expect, vi } from 'vitest';
import { validateUploadedFile } from '@/lib/parsing/validator';
import { parseRawText } from '@/lib/parsing/text';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { createDocumentChunks } from '@/lib/chunking/tokenChunker';
import { retrieveRelevantChunks } from '@/lib/retrieval/search';
import { validateAndLinkCitations, verifyQuoteInText } from '@/lib/validation/citationValidator';
import { generateDocumentMarkdown } from '@/lib/export/markdown';
import { generateDocumentPdfBuffer } from '@/lib/export/pdf';
import { LegalLensDocument } from '@/types/document';
import { ClauseItem, LawyerChecklistItem } from '@/types/clause';
import { LEGAL_DISCLAIMER } from '@/lib/constants';
import { SAMPLE_LEASE_TEXT, SAMPLE_NDA_V1_TEXT, SAMPLE_NDA_V2_TEXT } from '@/lib/fixtures/samples';

describe('LegalLens End-to-End Workflow Verification', () => {
  it('executes full pipeline: Upload -> Parse -> Sections -> Chunks -> Summary -> Clauses -> QA -> Citations -> Export', async () => {
    // 1. File Upload & Validation
    const fileName = 'Residential_Lease_Agreement.txt';
    const fileSize = Buffer.byteLength(SAMPLE_LEASE_TEXT);
    const validation = validateUploadedFile(fileName, fileSize);
    expect(validation.valid).toBe(true);

    // 2. Text Parsing
    const parsed = parseRawText(SAMPLE_LEASE_TEXT);
    expect(parsed.text.length).toBeGreaterThan(100);

    // 3. Section Splitting
    const sections = splitIntoSections(parsed.text);
    expect(sections.length).toBeGreaterThanOrEqual(7);

    // 4. Chunking
    const chunks = createDocumentChunks(sections);
    expect(chunks.length).toBeGreaterThanOrEqual(sections.length);

    // 5. Mocked Claude Summary Output
    const mockSummary = {
      overview: 'Residential lease agreement outlining rental terms for 742 Evergreen Terrace.',
      documentType: 'Residential Lease Agreement',
      mainParties: ['Apex Property Management LLC', 'Jane Doe'],
      effectiveDateOrTerm: '12-Month Lease (Nov 1, 2026 - Oct 31, 2027)',
      keyTakeaways: [
        'Monthly rent of $2,400 due on the 1st of the month',
        'Automatic renewal requires written notice at least 60 days before expiration',
        'Early termination incurs a 3-month liquidated damages penalty ($7,200)',
      ],
      disclaimer: LEGAL_DISCLAIMER,
    };

    // 6. Mocked Claude Clause Detection & Classification
    const mockClauses: ClauseItem[] = [
      {
        id: 'clause-1',
        category: 'auto-renewal',
        attentionLevel: 'high',
        title: 'Automatic 12-Month Renewal',
        reason: 'Requires 60-day notice or irrevocably renews for 12 months with 10% rent hike',
        plainLanguageExplanation:
          'Unless you give written notice 60 days before your lease ends, your contract automatically locks in for another full year with higher rent.',
        sourceSection: '4. AUTOMATIC RENEWAL AND NOTICE REQUIREMENTS',
        quote: 'Unless either party provides written notice of intent not to renew at least sixty (60) days prior',
        questionForLawyer: 'Can the 60-day automatic renewal be modified to convert to a month-to-month tenancy?',
      },
      {
        id: 'clause-2',
        category: 'penalties',
        attentionLevel: 'high',
        title: 'Early Termination Liquidated Damages',
        reason: 'Forfeits entire deposit plus 3 months rent penalty ($7,200)',
        plainLanguageExplanation:
          'If you break the lease early, you immediately lose your security deposit and must pay an extra $7,200 fee.',
        sourceSection: '7. TERMINATION AND DEFAULT',
        quote: 'liquidated damages penalty equal to three (3) months rent ($7,200.00)',
        questionForLawyer: 'Is a 3-month liquidated damages penalty enforceable in this jurisdiction?',
      },
      {
        id: 'clause-3',
        category: 'deadlines',
        attentionLevel: 'medium',
        title: 'Rent Grace Period and Late Penalty Fee',
        reason: 'Late fee of $150 plus $15/day applies starting on the 5th day',
        plainLanguageExplanation:
          'Rent must be paid by the 5th of the month, or a substantial late penalty and daily fees apply.',
        sourceSection: '2. RENT AND PAYMENT DEADLINES',
        quote: 'mandatory late penalty fee of $150.00 plus $15.00 per day',
        questionForLawyer: 'Is there a statutory cap on residential late fees?',
      },
    ];

    // Verify all quotes in clauses actually exist in the document text
    for (const cl of mockClauses) {
      expect(verifyQuoteInText(cl.quote, parsed.text)).toBe(true);
    }

    // 7. Generate Lawyer Checklist
    const mockChecklist: LawyerChecklistItem[] = mockClauses.map((c) => ({
      id: `chk-${c.id}`,
      clauseId: c.id,
      type: c.attentionLevel === 'high' ? 'negotiation' : 'question',
      text: c.questionForLawyer,
      context: `${c.title} (${c.attentionLevel} attention): ${c.reason}`,
      sourceSection: c.sourceSection,
    }));
    expect(mockChecklist.length).toBe(3);

    // Construct full LegalLensDocument
    const document: LegalLensDocument = {
      id: 'doc-test-1',
      fileName,
      fileSize,
      fileType: 'txt',
      uploadedAt: new Date().toISOString(),
      rawText: parsed.text,
      sections,
      chunks,
      summary: mockSummary,
      clauses: mockClauses,
      lawyerChecklist: mockChecklist,
    };

    // 8. Retrieval & Scoped Q&A
    const retrievalResults = retrieveRelevantChunks(
      'What are the notice rules and renewal terms?',
      chunks,
      3
    );
    expect(retrievalResults.length).toBeGreaterThan(0);
    expect(retrievalResults[0].chunk.sectionTitle).toContain('RENEWAL');

    // Citation linking check
    const rawAnswerCitations = [
      {
        sectionId: '',
        sectionTitle: '4. AUTOMATIC RENEWAL AND NOTICE REQUIREMENTS',
        quote: 'written notice of intent not to renew at least sixty (60) days',
      },
    ];
    const { verifiedCitations, hasUnverified } = validateAndLinkCitations(
      rawAnswerCitations,
      chunks,
      parsed.text
    );
    expect(hasUnverified).toBe(false);
    expect(verifiedCitations.length).toBe(1);

    // 9. Markdown Export Verification
    const markdown = generateDocumentMarkdown(document);
    expect(markdown).toContain('# LegalLens Analysis Report');
    expect(markdown).toContain(LEGAL_DISCLAIMER);
    expect(markdown).toContain('Automatic 12-Month Renewal');
    expect(markdown).toContain('Questions to Ask a Lawyer');

    // 10. PDF Export Verification
    const pdfBuffer = generateDocumentPdfBuffer(document);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(500); // Valid PDF binary data
  });
});
