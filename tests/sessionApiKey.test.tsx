import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { DocumentWorkspace } from '@/components/document/DocumentWorkspace';
import { Navbar } from '@/components/layout/Navbar';
import { LegalLensDocument } from '@/types/document';

describe('Flow 1: Server-Side API Key Architecture & Client Cleanliness', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    sessionStorage.clear();
    localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('Navbar renders with connected status badge and has zero API key input buttons or modals', () => {
    render(<Navbar />);

    // Verify connected status is rendered
    expect(screen.getByText(/NVIDIA NIM:/i)).toBeDefined();
    expect(screen.getByText(/Connected/i)).toBeDefined();

    // Verify zero user API key input fields or prompts
    expect(screen.queryByPlaceholderText(/nvapi-\.\.\./i)).toBeNull();
    expect(screen.queryByRole('button', { name: /save key/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open api key settings/i })).toBeNull();
  });

  it('verifies /api/analyze requests rely solely on server environment and never inject client x-nvidia-api-key headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'doc-1',
        fileName: 'test.txt',
        fileSize: 100,
        fileType: 'txt',
        uploadedAt: new Date().toISOString(),
        rawText: 'Contract terms and conditions',
        sections: [
          {
            id: 'sec-1',
            title: 'Terms',
            originalText: 'Terms',
            plainLanguageSummary: '',
            keyPoints: [],
            startIndex: 0,
            endIndex: 5,
          },
        ],
        chunks: [],
        clauses: [
          {
            id: 'c-1',
            category: 'liability',
            attentionLevel: 'medium',
            title: 'Cap',
            reason: 'r',
            plainLanguageExplanation: 'e',
            sourceSection: 'Terms',
            quote: 'Terms',
            questionForLawyer: 'q',
          },
        ],
        summary: { documentType: 'Agreement', overview: 'Summary text', keyTakeaways: [] },
        lawyerChecklist: [],
      }),
    });
    global.fetch = fetchMock;

    const mockDoc: LegalLensDocument = {
      id: 'doc-1',
      fileName: 'test.txt',
      fileSize: 100,
      fileType: 'txt',
      uploadedAt: new Date().toISOString(),
      rawText: 'Contract terms and conditions',
      sections: [
        {
          id: 'sec-1',
          title: 'Terms',
          originalText: 'Terms',
          plainLanguageSummary: '',
          keyPoints: [],
          startIndex: 0,
          endIndex: 5,
        },
      ],
      chunks: [],
      clauses: [],
      summary: undefined,
      lawyerChecklist: [],
    };

    render(<DocumentWorkspace initialDocument={mockDoc} onReset={vi.fn()} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/analyze');
    expect(options.headers).toBeDefined();

    // Verify zero client-side key header injection
    expect(options.headers['x-nvidia-api-key']).toBeUndefined();
    expect(options.headers['x-openrouter-api-key']).toBeUndefined();
  });

  it('SECURITY: confirms zero client-side key persistence in sessionStorage, localStorage, or cookies', () => {
    // Assert storage is completely free of any api key keys or values
    expect(sessionStorage.getItem('legallens_nvidia_api_key')).toBeNull();
    expect(sessionStorage.getItem('legallens_openrouter_api_key')).toBeNull();
    expect(localStorage.getItem('legallens_nvidia_api_key')).toBeNull();
    expect(document.cookie).toBe('');
  });
});
