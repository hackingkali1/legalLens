import { describe, it, expect } from 'vitest';
import { parsePdfBuffer } from '@/lib/parsing/pdf';
import {
  PdfPasswordProtectedError,
  PdfCorruptedError,
  PdfNoSelectableTextError,
} from '@/lib/parsing/errors';
import {
  createNormalTextPdfBuffer,
  createScannedImagePdfBuffer,
  createPasswordProtectedPdfBuffer,
  createCorruptedPdfBuffer,
} from '@/lib/fixtures/pdfFixtures';

describe('PDF Parsing Engine & Failure Modes', () => {
  it('successfully extracts text from a standard PDF with selectable text layer', async () => {
    const normalPdf = createNormalTextPdfBuffer();
    const result = await parsePdfBuffer(normalPdf);

    expect(result.extractionMethod).toBe('native');
    expect(result.pagesCount).toBeGreaterThanOrEqual(1);
    expect(result.text).toContain('RESIDENTIAL LEASE AGREEMENT');
    expect(result.text).toContain('Monthly Rent');
  });

  it('fails with distinct PdfPasswordProtectedError for password-protected/encrypted PDFs', async () => {
    const passwordPdf = createPasswordProtectedPdfBuffer();

    await expect(parsePdfBuffer(passwordPdf)).rejects.toThrow(PdfPasswordProtectedError);

    try {
      await parsePdfBuffer(passwordPdf);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PdfPasswordProtectedError);
      const typed = err as PdfPasswordProtectedError;
      expect(typed.code).toBe('PASSWORD_PROTECTED');
      expect(typed.message).toContain('password-protected or encrypted');
    }
  });

  it('fails with distinct PdfCorruptedError for corrupted, damaged, or malformed PDFs', async () => {
    const corruptedPdf = createCorruptedPdfBuffer();

    await expect(parsePdfBuffer(corruptedPdf)).rejects.toThrow(PdfCorruptedError);

    try {
      await parsePdfBuffer(corruptedPdf);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PdfCorruptedError);
      const typed = err as PdfCorruptedError;
      expect(typed.code).toBe('CORRUPTED_FILE');
      expect(typed.message).toContain('corrupted or damaged');
    }
  });

  it('fails with PdfCorruptedError when file lacks valid %PDF header', async () => {
    const nonPdf = Buffer.from('This is a plain text file pretending to be pdf');

    await expect(parsePdfBuffer(nonPdf)).rejects.toThrow(PdfCorruptedError);
  });

  it('successfully recovers text via OCR for scanned/image-only PDFs', async () => {
    const scannedPdf = createScannedImagePdfBuffer();
    const result = await parsePdfBuffer(scannedPdf);

    expect(result.extractionMethod).toBe('ocr');
    expect(result.pagesCount).toBeGreaterThanOrEqual(1);
    // OCR should recognize text rendered in the canvas image
    expect(result.text.toUpperCase()).toContain('NON-DISCLOSURE');
  }, 25000); // Allow OCR execution time

  it('throws PdfNoSelectableTextError on genuinely blank/empty PDFs after OCR', async () => {
    // PDF with a blank white page and zero text
    const { jsPDF } = await import('jspdf');
    const blankDoc = new jsPDF();
    // Do not add any text or image
    const blankPdf = Buffer.from(blankDoc.output('arraybuffer'));

    await expect(parsePdfBuffer(blankPdf)).rejects.toThrow(PdfNoSelectableTextError);

    try {
      await parsePdfBuffer(blankPdf);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PdfNoSelectableTextError);
      const typed = err as PdfNoSelectableTextError;
      expect(typed.code).toBe('NO_TEXT_LAYER');
    }
  }, 25000);
});
