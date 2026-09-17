import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDocumentSummary, batchDocumentSections, SINGLE_PASS_MAX_CHARS } from '@/lib/ai/analyzeDocument';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { SAMPLE_LEASE_TEXT } from '@/lib/fixtures/samples';
import { SAMPLE_COURT_NOTICE_TEXT } from '@/lib/fixtures/courtNoticeFixture';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('Document Summary Quality & Chunking Verification', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.NVIDIA_API_KEY = 'nvapi-mock-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('Residential Lease Agreement: executes in a SINGLE unified pass (1 LLM call) for all 9 sections', async () => {
    const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
    expect(sections).toHaveLength(9);

    // Verify single-pass threshold: 9-section lease is well under 50,000 chars
    const totalChars = sections.reduce((sum, s) => sum + s.originalText.length, 0);
    expect(totalChars).toBeLessThanOrEqual(SINGLE_PASS_MAX_CHARS);

    // Single-pass: entire document is sent in one DOCUMENT_SUMMARY_PROMPT call
    const mockResponse = {
      overview:
        'Residential lease agreement between Apex Property Management LLC and Jane Doe for 742 Evergreen Terrace.',
      documentType: 'Residential Lease Agreement',
      mainParties: ['Apex Property Management LLC (Landlord)', 'Jane Doe (Tenant)'],
      effectiveDateOrTerm: 'November 1, 2026 to October 31, 2027 (12 months)',
      keyTakeaways: [
        'Monthly rent of $2,400 due on the 1st with late penalty after the 5th.',
        'Security deposit of $2,400 refundable within 30 days of move-out.',
        'Automatic 12-month renewal unless 60-day written notice is provided.',
      ],
      sectionSummaries: sections.map((s) => ({
        sectionId: s.id,
        plainLanguageSummary: `Plain summary for ${s.title}`,
        keyPoints: [`Key point A for ${s.title}`, `Key point B for ${s.title}`],
      })),
      disclaimer: LEGAL_DISCLAIMER,
    };

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    });

    global.fetch = fetchMock;

    const { summary, updatedSections } = await generateDocumentSummary(sections);

    // Must be exactly 1 LLM call — not batched
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updatedSections).toHaveLength(9);

    // Verify all 9 sections have summaries and key points without truncation
    for (const sec of updatedSections) {
      expect(sec.plainLanguageSummary).toContain('Plain summary for');
      expect(sec.keyPoints.length).toBeGreaterThan(0);
    }

    // Verify executive synthesis
    expect(summary.documentType).toBe('Residential Lease Agreement');
    expect(summary.mainParties).toContain('Apex Property Management LLC (Landlord)');
    expect(summary.mainParties).toContain('Jane Doe (Tenant)');
    expect(summary.keyTakeaways).toHaveLength(3);
    expect(summary.disclaimer).toBe(LEGAL_DISCLAIMER);
  });

  it('Court Notice Fixture: executes in a SINGLE unified pass (1 LLM call) with all summons/injunction details preserved', async () => {
    const sections = splitIntoSections(SAMPLE_COURT_NOTICE_TEXT);
    expect(sections).toHaveLength(5);

    // Verify single-pass threshold: court notice is well under 50,000 chars
    const totalChars = sections.reduce((sum, s) => sum + s.originalText.length, 0);
    expect(totalChars).toBeLessThanOrEqual(SINGLE_PASS_MAX_CHARS);

    const mockResponse = {
      overview:
        'Court summons and interim injunction notice issued by the Senior Civil Judge, Amaravati in Civil Suit No. 184/2026 (Ramesh Kumar v. Arun Prasad).',
      documentType: 'Court Summons & Injunction Notice',
      mainParties: ['Ramesh Kumar (Plaintiff)', 'Arun Prasad (Defendant)'],
      effectiveDateOrTerm: 'Hearing Date: 14 October 2026',
      keyTakeaways: [
        'Defendant must appear before Court Hall 3 on 14 October 2026 at 10:30 AM.',
        'Written Statement of defense must be filed strictly within 30 days.',
        'Interim injunction strictly prohibits transfer or alteration of Schedule A property.',
      ],
      sectionSummaries: sections.map((s) => ({
        sectionId: s.id,
        plainLanguageSummary: `Court directions regarding ${s.title}.`,
        keyPoints: ['Filing timeline requirements', 'Status quo obligation'],
      })),
      disclaimer: LEGAL_DISCLAIMER,
    };

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    });

    global.fetch = fetchMock;

    const { summary, updatedSections } = await generateDocumentSummary(sections);

    // Must be exactly 1 LLM call — not batched
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updatedSections).toHaveLength(5);
    expect(summary.documentType).toBe('Court Summons & Injunction Notice');
    expect(summary.mainParties).toContain('Ramesh Kumar (Plaintiff)');
    expect(summary.mainParties).toContain('Arun Prasad (Defendant)');
    expect(summary.effectiveDateOrTerm).toBe('Hearing Date: 14 October 2026');
  });

  it('batchDocumentSections helper: groups sections correctly for the large-document fallback path', () => {
    // batchDocumentSections is only used for docs >50k chars. Test the helper directly.
    // 5 sections × large text to verify batch grouping with new defaults (MAX=6, maxChars=12000).
    const largeSections = Array.from({ length: 5 }, (_, i) => ({
      id: `sec-${i + 1}`,
      title: `Section ${i + 1}`,
      originalText: 'X'.repeat(10000), // 10k chars each -> each section is its own batch
      plainLanguageSummary: '',
      keyPoints: [],
      startIndex: i * 10000,
      endIndex: (i + 1) * 10000,
    }));

    // With maxChars=12000 and maxCount=6: each 10k-char section packs into one batch (10k < 12k)
    // but the SECOND section would push current batch to 20k > 12k -> emit after each section
    const batches = batchDocumentSections(largeSections);
    // Each section is its own batch since 10000 + 10000 = 20000 > TARGET_SECTION_BATCH_CHARS (12000)
    expect(batches.length).toBe(5);
    for (const batch of batches) {
      expect(batch.length).toBe(1);
    }
  });
});
