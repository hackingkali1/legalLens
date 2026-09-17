import './polyfills';
import { PDFParse } from 'pdf-parse';
import {
  PdfPasswordProtectedError,
  PdfCorruptedError,
  PdfUnsupportedFormatError,
  PdfNoSelectableTextError,
} from './errors';
import { ocrExtractPdfBuffer, OcrProgressCallback } from './ocr';

// Pre-bind WorkerMessageHandler directly into globalThis.pdfjsWorker.
// This allows pdfjs-dist in Next.js Turbopack / Node environments to execute
// in-process without attempting broken dynamic import(workerSrc) fake worker loads.
try {
  if (typeof globalThis !== 'undefined' && !(globalThis as Record<string, unknown>).pdfjsWorker) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (globalThis as Record<string, unknown>).pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }
} catch {
  // Graceful fallback if require is not supported in the active bundle target
}

/**
 * Strips PDF pagination artifacts (e.g. "-- 1 of 3 --") to accurately evaluate
 * the length of actual extracted legal document text.
 */
function stripPaginationMarkers(text: string): string {
  return text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').trim();
}

export interface ParsePdfOptions {
  onProgress?: OcrProgressCallback;
}

export interface ParsePdfResult {
  text: string;
  pagesCount: number;
  extractionMethod: 'native' | 'ocr';
}

/**
 * Parses a PDF buffer and extracts text.
 * If primary text-layer extraction returns empty/near-empty content (e.g. scanned/image-only PDF),
 * falls back to OCR via tesseract.js.
 * Throws specific typed errors for password-protected, corrupted, or unsupported PDFs.
 */
export async function parsePdfBuffer(
  buffer: Buffer,
  options?: ParsePdfOptions
): Promise<ParsePdfResult> {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    console.log(`[PDFParse Debug] Initiating parse for PDF buffer (${buffer.length} bytes)`);
  }

  // Quick sanity check on minimal PDF header
  if (buffer.length < 5 || !buffer.subarray(0, 5).toString('ascii').startsWith('%PDF')) {
    if (isDev) {
      console.warn('[PDFParse Debug] Header check failed: Missing %PDF header bytes');
    }
    throw new PdfCorruptedError('The file does not have a valid PDF header (%PDF). It may be corrupted or not a PDF.');
  }

  let nativeText = '';
  let pagesCount = 1;
  let primaryExtractionSucceeded = false;

  try {
    const bufferCopy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const uint8Array = new Uint8Array(bufferCopy);
    const parser = new PDFParse({ data: uint8Array });
    const textResult = await parser.getText();
    pagesCount = textResult.pages?.length || textResult.total || 1;
    await parser.destroy();

    const rawExtracted = (textResult.text || '').replace(/\r\n/g, '\n').trim();
    const contentWithoutPagination = stripPaginationMarkers(rawExtracted);

    if (isDev) {
      console.log(
        `[PDFParse Debug] Primary extraction completed: pages=${pagesCount}, rawLength=${rawExtracted.length}, contentChars=${contentWithoutPagination.length}`
      );
    }

    // A document with at least 30 non-pagination characters is considered to have a selectable text layer
    if (contentWithoutPagination.length >= 30) {
      nativeText = rawExtracted;
      primaryExtractionSucceeded = true;
      return {
        text: nativeText,
        pagesCount,
        extractionMethod: 'native',
      };
    } else {
      if (isDev) {
        console.log(
          `[PDFParse Debug] Selectable text too short (${contentWithoutPagination.length} chars). PDF appears to be scanned or image-only.`
        );
      }
    }
  } catch (err: unknown) {
    const errObj = err as { name?: string; message?: string };
    const errName = errObj.name || '';
    const errMsg = errObj.message || '';

    if (isDev) {
      console.warn(`[PDFParse Debug] Primary extraction error caught: name=${errName}, message=${errMsg}`);
    }

    // 1. Password Protected / Encrypted PDFs
    if (
      errName === 'PasswordException' ||
      /password/i.test(errMsg) ||
      /encrypt/i.test(errMsg) ||
      /bad password/i.test(errMsg)
    ) {
      throw new PdfPasswordProtectedError(
        'This PDF is password-protected or encrypted. Please remove password protection and try again.'
      );
    }

    // 2. Corrupted PDF Structure
    if (
      errName === 'InvalidPDFException' ||
      /invalid pdf/i.test(errMsg) ||
      /corrupt/i.test(errMsg) ||
      /bad xref/i.test(errMsg) ||
      /missing endstream/i.test(errMsg)
    ) {
      throw new PdfCorruptedError(
        'This PDF file appears to be corrupted or damaged and cannot be parsed.'
      );
    }

    // 3. Format / Compression Errors
    if (
      errName === 'FormatError' ||
      /unsupported/i.test(errMsg) ||
      /format error/i.test(errMsg)
    ) {
      throw new PdfUnsupportedFormatError(
        'This PDF contains an unsupported structure or encoding standard.'
      );
    }

    // If it's another internal issue (like font/CMap), proceed to OCR fallback below
    if (isDev) {
      console.log('[PDFParse Debug] Non-fatal primary error. Falling through to OCR fallback...');
    }
  }

  // --- OCR Fallback Path ---
  if (!primaryExtractionSucceeded) {
    if (isDev) {
      console.log('[PDFParse Debug] Invoking OCR fallback engine...');
    }

    options?.onProgress?.('Scanned PDF detected. Running OCR text extraction...', 0.2);

    try {
      const ocrResult = await ocrExtractPdfBuffer(buffer, options?.onProgress);
      const ocrCleanText = stripPaginationMarkers(ocrResult.text);

      if (isDev) {
        console.log(`[PDFParse Debug] OCR engine returned ${ocrCleanText.length} characters.`);
      }

      if (ocrCleanText.length >= 20) {
        return {
          text: ocrResult.text,
          pagesCount: ocrResult.pagesCount || pagesCount,
          extractionMethod: 'ocr',
        };
      }
    } catch (ocrErr: unknown) {
      if (isDev) {
        const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
        console.warn('[PDFParse Debug] OCR extraction failed:', msg);
      }
    }

    // If both primary extraction and OCR yield insufficient readable text, throw distinct error
    throw new PdfNoSelectableTextError(
      'Failed to parse PDF document: The PDF contains no selectable text layer and OCR could not detect readable text. It may be blank, low-resolution, or empty.'
    );
  }

  return {
    text: nativeText,
    pagesCount,
    extractionMethod: 'native',
  };
}
