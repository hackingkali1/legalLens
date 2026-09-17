import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentUploadArea } from '@/components/upload/DocumentUploadArea';
import { CompareView } from '@/components/compare/CompareView';
import { DocumentWorkspace } from '@/components/document/DocumentWorkspace';
import { Modal } from '@/components/ui/Modal';
import { LegalLensDocument } from '@/types/document';

describe('Component & DOM Regression Tests for Historical Bugs', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // jsdom doesn't implement scrollIntoView by default
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // FLOW 1: Upload flow & Paste Text without file extension validation
  describe('Flow 1: Document Upload & Paste-Text Flow (Bug 1 Regression)', () => {
    const mockDoc: LegalLensDocument = {
      id: 'doc-123',
      fileName: 'notice',
      fileSize: 100,
      fileType: 'txt',
      uploadedAt: new Date().toISOString(),
      rawText: 'This is a valid legal notice document text exceeding minimum length requirements.',
      sections: [
        {
          id: 'sec-1',
          title: 'Notice',
          originalText: 'This is a valid legal notice document text exceeding minimum length requirements.',
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 82,
        },
      ],
      chunks: [],
      clauses: [],
      lawyerChecklist: [],
    };

    it('successfully uploads valid PDF/DOCX/TXT files', async () => {
      const onDocumentLoaded = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockDoc, fileName: 'contract.pdf', fileType: 'pdf' }),
      });
      global.fetch = fetchMock;

      render(<DocumentUploadArea onDocumentLoaded={onDocumentLoaded} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const pdfFile = new File(['%PDF-1.4 valid mock header and text'], 'contract.pdf', {
        type: 'application/pdf',
      });
      fireEvent.change(fileInput, { target: { files: [pdfFile] } });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onDocumentLoaded).toHaveBeenCalledWith(
          expect.objectContaining({ fileName: 'contract.pdf', fileType: 'pdf' })
        );
      });
    });

    it('rejects invalid file types when upload fails validation', async () => {
      const onDocumentLoaded = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'Unsupported file format (.exe). LegalLens accepts PDF, DOCX, and TXT files only.',
        }),
      });
      global.fetch = fetchMock;

      render(<DocumentUploadArea onDocumentLoaded={onDocumentLoaded} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const exeFile = new File(['MZ executable binary'], 'malicious.exe', {
        type: 'application/x-msdownload',
      });
      fireEvent.change(fileInput, { target: { files: [exeFile] } });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText(/unsupported file format \(\.exe\)/i)).toBeDefined();
      });

      expect(onDocumentLoaded).not.toHaveBeenCalled();
    });

    it('processes pasted text with title "notice" without .notice file extension error', async () => {
      const onDocumentLoaded = vi.fn();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDoc,
      });
      global.fetch = fetchMock;

      render(<DocumentUploadArea onDocumentLoaded={onDocumentLoaded} />);

      // Click "Paste Text" button to open modal
      const pasteBtn = screen.getByRole('button', { name: /paste text/i });
      fireEvent.click(pasteBtn);

      // Verify Paste modal is open
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(/paste legal document text/i)).toBeDefined();

      // Enter title "notice" (no extension intended - Bug 1 repro)
      const titleInput = screen.getByLabelText(/document title/i);
      fireEvent.change(titleInput, { target: { value: 'notice' } });

      // Enter document text
      const textArea = screen.getByLabelText(/agreement text/i);
      fireEvent.change(textArea, {
        target: {
          value: 'This is a valid legal notice document text exceeding minimum length requirements.',
        },
      });

      // Submit form
      const submitBtn = screen.getByRole('button', { name: /parse & simplify text/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      // Verify payload was sent as JSON directly with fileName="notice"
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/upload');
      expect(options.headers['Content-Type']).toBe('application/json');

      const sentBody = JSON.parse(options.body as string);
      expect(sentBody.fileName).toBe('notice');
      expect(sentBody.text).toContain('valid legal notice');

      // Verify no ".notice" error was displayed and onDocumentLoaded was invoked
      expect(screen.queryByText(/unsupported file format \(\.notice\)/i)).toBeNull();
      expect(onDocumentLoaded).toHaveBeenCalledWith(mockDoc);
    });
  });

  // FLOW 2: Compare Versions payload shape validation
  describe('Flow 2: Compare Versions Payload Shape (Bug 2 Regression)', () => {
    it('sends a named object payload matching CompareRequestSchema instead of an array', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          summaryOverview: 'Changes between NDA versions',
          materialChanges: [],
          disclaimer: 'Not legal advice',
        }),
      });
      global.fetch = fetchMock;

      render(<CompareView />);

      const inputs = screen.getAllByRole('textbox');
      // Inputs: docAName (0), docAText (1), docBName (2), docBText (3)
      fireEvent.change(inputs[0], { target: { value: 'Mutual NDA 2025' } });
      fireEvent.change(inputs[1], { target: { value: 'Contract A original text terms and conditions.' } });
      fireEvent.change(inputs[2], { target: { value: 'Mutual NDA 2026' } });
      fireEvent.change(inputs[3], { target: { value: 'Contract B revised text terms and conditions.' } });

      const compareBtn = screen.getByRole('button', { name: /analyze material differences/i });
      fireEvent.click(compareBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/compare');

      const parsedPayload = JSON.parse(options.body as string);

      // CRITICAL ASSERTION: Payload MUST be an object with named properties, NOT an array [docAText, docBText]
      expect(Array.isArray(parsedPayload)).toBe(false);
      expect(typeof parsedPayload).toBe('object');
      expect(parsedPayload).toHaveProperty('docAName', 'Mutual NDA 2025');
      expect(parsedPayload).toHaveProperty('docAText', 'Contract A original text terms and conditions.');
      expect(parsedPayload).toHaveProperty('docBName', 'Mutual NDA 2026');
      expect(parsedPayload).toHaveProperty('docBText', 'Contract B revised text terms and conditions.');
    });
  });

  // FLOW 3: Per-Section Error Isolation in DocumentWorkspace
  describe('Flow 3: Per-Section Error Isolation (False-Positive Banner Regression)', () => {
    const baseDocWithClauses: LegalLensDocument = {
      id: 'doc-isolated-1',
      fileName: 'service_agreement.txt',
      fileSize: 2048,
      fileType: 'txt',
      uploadedAt: new Date().toISOString(),
      rawText: 'Service agreement terms with 30 day termination.',
      sections: [
        {
          id: 'sec-1',
          title: 'TERMINATION',
          originalText: 'Termination requires 30 days notice.',
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 35,
        },
      ],
      chunks: [],
      // Clauses populated and working
      clauses: [
        {
          id: 'clause-1',
          category: 'termination',
          attentionLevel: 'high',
          title: 'Immediate Termination',
          reason: 'Unilateral termination right',
          plainLanguageExplanation: 'They can terminate anytime.',
          sourceSection: 'TERMINATION',
          quote: 'Termination requires 30 days notice.',
          questionForLawyer: 'Can we make termination notice mutual?',
        },
      ],
      lawyerChecklist: [],
      summary: undefined,
    };

    it('isolates summary failure without showing a global error banner over working clauses', async () => {
      // Mock /api/analyze returning partial success: clauses present, but summary error attached
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...baseDocWithClauses,
          errors: {
            summary: 'Something went wrong generating the plain summary — please try again.',
          },
        }),
      });
      global.fetch = fetchMock;

      render(<DocumentWorkspace initialDocument={baseDocWithClauses} onReset={vi.fn()} />);

      // Switch to Clause Attention Flags tab
      const clausesTab =
        screen.queryAllByRole('tab', { name: /clause attention flags/i })[0] ||
        screen.getAllByRole('button', { name: /clause attention flags/i })[0];
      fireEvent.click(clausesTab);

      // 1. Assert: Clauses tab renders clause content cleanly
      expect(screen.getByText('Immediate Termination')).toBeDefined();
      expect(screen.getByText('Unilateral termination right')).toBeDefined();

      // 2. Assert: NO global false-positive error banner is shown
      expect(
        screen.queryByText(/something went wrong analyzing this document/i)
      ).toBeNull();

      // 3. Assert: NO error banner on the clause tab itself (data rendered successfully)
      const clauseError = screen.queryByText(/retry attention flags/i);
      expect(clauseError).toBeNull();

      // 4. Switch to Plain Summary tab
      const summaryTab =
        screen.queryAllByRole('tab', { name: /plain summary/i })[0] ||
        screen.getAllByRole('button', { name: /plain summary/i })[0];
      fireEvent.click(summaryTab);

      // 5. Assert: Scoped error with retry button is visible ONLY on Plain Summary tab
      await waitFor(() => {
        const retrySummaryBtn = screen.getByRole('button', { name: /retry plain summary/i });
        expect(retrySummaryBtn).toBeDefined();
      });
    });
  });

  // FLOW 4: Modal Accessibility (Focus Trap, Escape Key, Focus Return)
  describe('Flow 4: Shared Modal Accessibility (Focus Trap, Escape, Focus Return)', () => {
    function ModalTestHarness() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <div>
          <button id="open-dialog-btn" onClick={() => setIsOpen(true)}>
            Open Dialog
          </button>
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} titleId="test-modal-title">
            <h2 id="test-modal-title">Accessible Dialog Title</h2>
            <input id="first-field" placeholder="First Field" />
            <button id="middle-action">Middle Action</button>
            <button id="close-dialog-btn" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </Modal>
        </div>
      );
    }

    it('has role="dialog" and aria-modal="true"', () => {
      render(<ModalTestHarness />);
      const openBtn = screen.getByRole('button', { name: /open dialog/i });
      fireEvent.click(openBtn);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('test-modal-title');
    });

    it('closes on Escape key press and restores focus to trigger button', async () => {
      render(<ModalTestHarness />);
      const openBtn = screen.getByRole('button', { name: /open dialog/i });
      openBtn.focus();
      expect(document.activeElement).toBe(openBtn);

      // Open modal
      fireEvent.click(openBtn);
      expect(screen.getByRole('dialog')).toBeDefined();

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

      // Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      // Focus returns to the button that opened it
      await waitFor(() => {
        expect(document.activeElement?.id).toBe('open-dialog-btn');
      });
    });

    it('traps Tab navigation within modal bounds', async () => {
      render(<ModalTestHarness />);
      const openBtn = screen.getByRole('button', { name: /open dialog/i });
      fireEvent.click(openBtn);

      const firstInput = document.getElementById('first-field') as HTMLElement;
      const lastButton = document.getElementById('close-dialog-btn') as HTMLElement;

      expect(firstInput).not.toBeNull();
      expect(lastButton).not.toBeNull();

      // Mock layout offset properties for jsdom visibility check
      Object.defineProperty(firstInput, 'offsetWidth', { configurable: true, value: 100 });
      Object.defineProperty(firstInput, 'offsetHeight', { configurable: true, value: 30 });
      Object.defineProperty(lastButton, 'offsetWidth', { configurable: true, value: 80 });
      Object.defineProperty(lastButton, 'offsetHeight', { configurable: true, value: 30 });

      // Set focus to last element
      lastButton.focus();
      expect(document.activeElement).toBe(lastButton);

      // Press Tab on last element -> wraps to first element
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(firstInput);

      // Press Shift+Tab on first element -> wraps to last element
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(lastButton);
    });
  });
});
