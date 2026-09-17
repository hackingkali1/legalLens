import { describe, it, expect } from 'vitest';
import { parseRawText } from '@/lib/parsing/text';
import { parsePdfBuffer } from '@/lib/parsing/pdf';
import { parseDocxBuffer } from '@/lib/parsing/docx';

describe('Document Parsing Engine', () => {
  it('parses raw text and strips BOM/normalizes carriage returns', () => {
    const raw = '\uFEFFSection 1. Term\r\nThe term of this agreement shall be 1 year.\r\n';
    const parsed = parseRawText(raw);
    expect(parsed.text).toBe('Section 1. Term\nThe term of this agreement shall be 1 year.');
  });

  it('throws helpful error on empty or whitespace-only text', () => {
    expect(() => parseRawText('')).toThrow('Provided text is empty.');
    expect(() => parseRawText('    \n\n  ')).toThrow('Provided text is empty.');
  });

  it('throws helpful error on documents that are too short to be legal agreements', () => {
    expect(() => parseRawText('Hi')).toThrow('too short to be analyzed');
  });

  it('fails gracefully when parsing an invalid or corrupted PDF buffer', async () => {
    const corruptedPdf = Buffer.from('%PDF-1.4 but corrupted content without EOF trailer');
    await expect(parsePdfBuffer(corruptedPdf)).rejects.toThrow('corrupted or damaged');
  });

  it('fails gracefully when parsing an invalid or non-DOCX buffer', async () => {
    const invalidDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x99, 0x99]);
    await expect(parseDocxBuffer(invalidDocx)).rejects.toThrow('Failed to parse DOCX document');
  });
});
