import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDocumentSummary, batchDocumentSections } from '@/lib/ai/analyzeDocument';
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

  it('Residential Lease Agreement: batches 9 sections into coherent chunks and synthesizes full overview', async () => {
    const sections = splitIntoSections(SAMPLE_LEASE_TEXT);
    expect(sections).toHaveLength(9);

    // Verify batching logic
    const batches = batchDocumentSections(sections);
    expect(batches.length).toBeGreaterThanOrEqual(3);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(3);
      const batchChars = batch.reduce((sum, s) => sum + s.originalText.length, 0);
      expect(batchChars).toBeLessThanOrEqual(3500);
    }

    // Mock completion responses for each batch and synthesis
    const mockBatchResponse = (batchIdx: number) => ({
      sectionSummaries: batches[batchIdx].map((s) => ({
        sectionId: s.id,
        plainLanguageSummary: `Plain summary for ${s.title}`,
        keyPoints: [`Key point A for ${s.title}`, `Key point B for ${s.title}`],
      })),
    });

    const mockSynthesisResponse = {
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
      disclaimer: LEGAL_DISCLAIMER,
    };

    const fetchMock = vi.fn();
    for (let i = 0; i < batches.length; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockBatchResponse(i)) } }],
        }),
      });
    }
    // Synthesis call
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockSynthesisResponse) } }],
      }),
    });

    global.fetch = fetchMock;

    const { summary, updatedSections } = await generateDocumentSummary(sections);

    expect(fetchMock).toHaveBeenCalledTimes(batches.length + 1);
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

  it('Court Notice Fixture: preserves all summons, injunction, and hearing details without truncation', async () => {
    const sections = splitIntoSections(SAMPLE_COURT_NOTICE_TEXT);
    expect(sections).toHaveLength(5);

    const batches = batchDocumentSections(sections);
    expect(batches.length).toBeGreaterThanOrEqual(2);

    const mockBatchResponse = (batchIdx: number) => ({
      sectionSummaries: batches[batchIdx].map((s) => ({
        sectionId: s.id,
        plainLanguageSummary: `Court directions regarding ${s.title}.`,
        keyPoints: [`Filing timeline requirements`, `Status quo obligation`],
      })),
    });

    const mockSynthesisResponse = {
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
      disclaimer: LEGAL_DISCLAIMER,
    };

    const fetchMock = vi.fn();
    for (let i = 0; i < batches.length; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockBatchResponse(i)) } }],
        }),
      });
    }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockSynthesisResponse) } }],
      }),
    });

    global.fetch = fetchMock;

    const { summary, updatedSections } = await generateDocumentSummary(sections);

    expect(fetchMock).toHaveBeenCalledTimes(batches.length + 1);
    expect(updatedSections).toHaveLength(5);
    expect(summary.documentType).toBe('Court Summons & Injunction Notice');
    expect(summary.mainParties).toContain('Ramesh Kumar (Plaintiff)');
    expect(summary.mainParties).toContain('Arun Prasad (Defendant)');
    expect(summary.effectiveDateOrTerm).toBe('Hearing Date: 14 October 2026');
  });
});
