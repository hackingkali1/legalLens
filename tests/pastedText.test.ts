import { describe, it, expect } from 'vitest';
import { validatePastedText } from '@/lib/parsing/validator';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { POST } from '@/app/api/upload/route';
import { NextRequest } from 'next/server';

describe('Paste Text Validation & Processing (Bug 1)', () => {
  it('validates plain text without treating titles as filenames or checking file extensions', () => {
    const sampleText = 'This is valid legal agreement text for testing.';

    // Titles with no extension
    const resNoExt = validatePastedText(sampleText);
    expect(resNoExt.valid).toBe(true);

    // Empty text should fail
    const resEmpty = validatePastedText('');
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.error).toContain('No document text was provided');

    const resWhitespace = validatePastedText('   \n\t  ');
    expect(resWhitespace.valid).toBe(false);
    expect(resWhitespace.error).toContain('No document text was provided');
  });

  it('rejects pasted text exceeding maximum size limit', () => {
    // Generate text slightly exceeding 10MB
    const oversized = 'x'.repeat(MAX_FILE_SIZE_BYTES + 1024);
    const res = validatePastedText(oversized);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceeds the maximum allowed limit of 10 MB');
  });

  it('handles titles with periods and non-extension names via /api/upload without file extension errors', async () => {
    const testCases = [
      { title: 'notice', text: 'This is a notice agreement without file extension.' },
      { title: 'Q3 Report v2.1', text: 'Agreement title containing a version period.' },
      { title: 'notice.final', text: 'Agreement title containing a custom dot notation.' },
      { title: 'Contract 2026.04.15 Update', text: 'Title with date format dots.' },
      { title: '', text: 'Agreement with no title provided.' },
    ];

    for (const tc of testCases) {
      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: tc.text,
          fileName: tc.title,
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.error).toBeUndefined();
      expect(data.rawText).toBe(tc.text);
      expect(data.fileType).toBe('txt');

      if (tc.title) {
        expect(data.fileName).toBe(tc.title);
      } else {
        expect(data.fileName).toBe('Pasted Document');
      }

      // Must have created sections and chunks
      expect(data.sections.length).toBeGreaterThanOrEqual(1);
      expect(data.chunks.length).toBeGreaterThanOrEqual(1);
    }
  });
});
