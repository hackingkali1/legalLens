import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ApiKeyModal,
  getSessionApiKey,
  SESSION_KEY_STORAGE,
} from '@/components/settings/ApiKeyModal';
import { DocumentWorkspace } from '@/components/document/DocumentWorkspace';
import { LegalLensDocument } from '@/types/document';

describe('Flow 1: Session API Key Storage & Header Propagation', () => {
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

  it('entering an OpenRouter/NVIDIA key stores it in sessionStorage', async () => {
    const onKeySaved = vi.fn();
    const onClose = vi.fn();

    render(<ApiKeyModal isOpen={true} onClose={onClose} onKeySaved={onKeySaved} />);

    const input = screen.getByPlaceholderText('nvapi-...');
    fireEvent.change(input, { target: { value: 'nvapi-test-secret-key-123456789' } });

    const saveBtn = screen.getByRole('button', { name: /save key/i });
    fireEvent.click(saveBtn);

    // 1. Assert: Key is correctly saved in sessionStorage
    expect(sessionStorage.getItem(SESSION_KEY_STORAGE)).toBe(
      'nvapi-test-secret-key-123456789'
    );
    expect(getSessionApiKey()).toBe('nvapi-test-secret-key-123456789');

    // 2. Assert: Callback fired after save animation
    await waitFor(
      () => {
        expect(onClose).toHaveBeenCalled();
        expect(onKeySaved).toHaveBeenCalled();
      },
      { timeout: 1500 }
    );
  });

  it('correctly attaches x-nvidia-api-key and x-openrouter-api-key headers on subsequent /api/analyze requests', async () => {
    // Store key in session
    sessionStorage.setItem(SESSION_KEY_STORAGE, 'nvapi-authorized-token-9999');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'doc-1',
        fileName: 'test.txt',
        fileSize: 100,
        fileType: 'txt',
        uploadedAt: new Date().toISOString(),
        rawText: 'Contract terms and conditions',
        sections: [{ id: 'sec-1', title: 'Terms', originalText: 'Terms', plainLanguageSummary: '', keyPoints: [], startIndex: 0, endIndex: 5 }],
        chunks: [],
        clauses: [{ id: 'c-1', category: 'liability', attentionLevel: 'medium', title: 'Cap', reason: 'r', plainLanguageExplanation: 'e', sourceSection: 'Terms', quote: 'Terms', questionForLawyer: 'q' }],
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
      sections: [{ id: 'sec-1', title: 'Terms', originalText: 'Terms', plainLanguageSummary: '', keyPoints: [], startIndex: 0, endIndex: 5 }],
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

    // Verify key propagation into headers
    expect(options.headers['x-nvidia-api-key']).toBe('nvapi-authorized-token-9999');
    expect(options.headers['x-openrouter-api-key']).toBe('nvapi-authorized-token-9999');
  });

  it('is scoped per-session and cleared on session end or explicit removal', () => {
    sessionStorage.setItem(SESSION_KEY_STORAGE, 'nvapi-temporary-session-key');
    expect(getSessionApiKey()).toBe('nvapi-temporary-session-key');

    const onClose = vi.fn();
    const { unmount } = render(<ApiKeyModal isOpen={true} onClose={onClose} />);

    // Click "Clear saved session key"
    const clearBtn = screen.getByRole('button', { name: /clear saved session key/i });
    fireEvent.click(clearBtn);

    // Verify cleared from sessionStorage
    expect(sessionStorage.getItem(SESSION_KEY_STORAGE)).toBeNull();
    expect(getSessionApiKey()).toBeUndefined();

    unmount();
  });

  it('SECURITY: confirms the key is NEVER written to persistent storage (localStorage, cookies) and NEVER logged', () => {
    // Spies on all console logging channels
    const logSpy = vi.spyOn(console, 'log');
    const infoSpy = vi.spyOn(console, 'info');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    const SECRET_KEY = 'nvapi-ultra-confidential-token-do-not-leak';

    render(<ApiKeyModal isOpen={true} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText('nvapi-...');
    fireEvent.change(input, { target: { value: SECRET_KEY } });

    const saveBtn = screen.getByRole('button', { name: /save key/i });
    fireEvent.click(saveBtn);

    // 1. MUST exist in sessionStorage
    expect(sessionStorage.getItem(SESSION_KEY_STORAGE)).toBe(SECRET_KEY);

    // 2. MUST NEVER exist in localStorage
    expect(localStorage.getItem(SESSION_KEY_STORAGE)).toBeNull();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        expect(localStorage.getItem(key)).not.toContain(SECRET_KEY);
      }
    }

    // 3. MUST NEVER exist in document.cookie
    expect(document.cookie).not.toContain(SECRET_KEY);

    // 4. MUST NEVER appear in any console/stdout logging output
    const allLoggedArgs = [
      ...logSpy.mock.calls.flat(),
      ...infoSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ];

    for (const loggedItem of allLoggedArgs) {
      const stringified = typeof loggedItem === 'object' ? JSON.stringify(loggedItem) : String(loggedItem);
      expect(stringified).not.toContain(SECRET_KEY);
    }
  });
});
