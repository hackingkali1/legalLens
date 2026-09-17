import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LawyerChecklistModal } from '@/components/export/LawyerChecklistModal';
import { generateDocumentMarkdown } from '@/lib/export/markdown';
import { generateDocumentPdfBuffer } from '@/lib/export/pdf';
import { LEGAL_DISCLAIMER } from '@/lib/constants';
import { LegalLensDocument } from '@/types/document';

describe('Flow 3: Lawyer Checklist & Export Generation', () => {
  let originalFetch: typeof global.fetch;

  const mockDocWithChecklist: LegalLensDocument = {
    id: 'doc-export-1',
    fileName: 'commercial_lease_2026.pdf',
    fileSize: 1024 * 50,
    fileType: 'pdf',
    uploadedAt: new Date().toISOString(),
    rawText: 'Full commercial lease text here...',
    sections: [
      {
        id: 'sec-1',
        title: 'RENT & DEPOSIT',
        originalText: 'Monthly rent is $5000 due on 1st.',
        plainLanguageSummary: 'Rent is $5000 per month.',
        keyPoints: ['$5000 rent'],
        startIndex: 0,
        endIndex: 32,
      },
    ],
    chunks: [],
    clauses: [
      {
        id: 'cl-1',
        category: 'penalties',
        attentionLevel: 'high',
        title: 'Late Rent Penalty',
        reason: '15% late fee charged immediately',
        plainLanguageExplanation: 'High 15% penalty fee applies immediately upon late payment.',
        sourceSection: 'RENT & DEPOSIT',
        quote: '15% late fee charged immediately',
        questionForLawyer: 'Can we negotiate a 5-day grace period?',
      },
    ],
    summary: {
      documentType: 'Commercial Lease',
      overview: 'Standard commercial lease with strict penalty provisions.',
      keyTakeaways: ['High penalty fee', '3-year commitment'],
      disclaimer: LEGAL_DISCLAIMER,
    },
    lawyerChecklist: [
      {
        id: 'chk-neg-1',
        type: 'negotiation',
        text: 'Request a 5-day grace period before late penalty accrues',
        context: '15% late fee applies on day 1',
        sourceSection: 'RENT & DEPOSIT',
      },
      {
        id: 'chk-q-1',
        type: 'question',
        text: 'Is a 15% late charge legally permissible under local state law?',
        context: 'Potential usury or statutory limits on commercial leases',
        sourceSection: 'RENT & DEPOSIT',
      },
    ],
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob');
    window.URL.revokeObjectURL = vi.fn();
    window.alert = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('checking/unchecking negotiation items updates state correctly', () => {
    render(
      <LawyerChecklistModal
        isOpen={true}
        onClose={vi.fn()}
        document={mockDocWithChecklist}
      />
    );

    const checkbox = screen.getByRole('checkbox', {
      name: /toggle request a 5-day grace period/i,
    }) as HTMLInputElement;

    // Initially unchecked
    expect(checkbox.checked).toBe(false);

    // Check item
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // Uncheck item
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('adding a custom question updates the list and appears in exported output payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['# Mock Export Markdown'], { type: 'text/markdown' }),
    });
    global.fetch = fetchMock;

    // Mock DOM elements for download click
    const createElementSpy = vi.spyOn(window.document, 'createElement');

    render(
      <LawyerChecklistModal
        isOpen={true}
        onClose={vi.fn()}
        document={mockDocWithChecklist}
      />
    );

    // 1. Enter custom question
    const customInput = screen.getByLabelText(/add custom question/i);
    fireEvent.change(customInput, {
      target: { value: 'Does landlord hold security deposit in an interest-bearing escrow account?' },
    });

    const addBtn = screen.getByRole('button', { name: /add question/i });
    fireEvent.click(addBtn);

    // 2. Assert custom question is now rendered in UI
    expect(
      screen.getByText('Does landlord hold security deposit in an interest-bearing escrow account?')
    ).toBeDefined();

    // 3. Trigger Markdown export
    const downloadMdBtn = screen.getByRole('button', { name: /download \.md/i });
    fireEvent.click(downloadMdBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // 4. Assert payload sent to /api/export contains the newly added custom question
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/export');
    const sentPayload = JSON.parse(options.body as string);
    expect(sentPayload.format).toBe('markdown');

    const exportedChecklist = sentPayload.document.lawyerChecklist;
    const addedCustomItem = exportedChecklist.find((item: any) =>
      item.text.includes('interest-bearing escrow account')
    );
    expect(addedCustomItem).toBeDefined();
    expect(addedCustomItem.type).toBe('question');
  });

  it('triggers Markdown export and download with legal disclaimer included', async () => {
    const mdReportText = `# LegalLens Analysis Report\n\n> [!IMPORTANT]\n> **LEGAL DISCLAIMER**\n> ${LEGAL_DISCLAIMER}\n`;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob([mdReportText], { type: 'text/markdown' }),
    });
    global.fetch = fetchMock;

    // Spy URL createObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-md-blob');
    window.URL.revokeObjectURL = vi.fn();

    render(
      <LawyerChecklistModal
        isOpen={true}
        onClose={vi.fn()}
        document={mockDocWithChecklist}
      />
    );

    const downloadMdBtn = screen.getByRole('button', { name: /download \.md/i });
    fireEvent.click(downloadMdBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });

    // Directly verify generated Markdown file content contains mandatory disclaimer
    const generatedMarkdown = generateDocumentMarkdown(mockDocWithChecklist);
    expect(generatedMarkdown).toContain('LEGAL DISCLAIMER');
    expect(generatedMarkdown).toContain(LEGAL_DISCLAIMER);
    expect(generatedMarkdown).toContain('Request a 5-day grace period before late penalty accrues');
  });

  it('triggers PDF export and download with legal disclaimer included', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF-1.4 mock binary'], { type: 'application/pdf' }),
    });
    global.fetch = fetchMock;

    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-pdf-blob');
    window.URL.revokeObjectURL = vi.fn();

    render(
      <LawyerChecklistModal
        isOpen={true}
        onClose={vi.fn()}
        document={mockDocWithChecklist}
      />
    );

    const downloadPdfBtn = screen.getByRole('button', { name: /download pdf report/i });
    fireEvent.click(downloadPdfBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });

    // Directly test generateDocumentPdfBuffer returns a valid PDF binary buffer
    const pdfUint8 = generateDocumentPdfBuffer(mockDocWithChecklist);
    expect(pdfUint8).toBeInstanceOf(Uint8Array);
    expect(pdfUint8.length).toBeGreaterThan(500);

    // Verify PDF header bytes (%PDF)
    const pdfHeader = Buffer.from(pdfUint8.subarray(0, 5)).toString('ascii');
    expect(pdfHeader).toBe('%PDF-');

    // Confirm disclaimer is formatted in the output
    const pdfString = Buffer.from(pdfUint8).toString('binary');
    expect(pdfString).toContain('DISCLAIMER');
  });
});
