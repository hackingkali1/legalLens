import './polyfills';
import { createWorker } from 'tesseract.js';
import { PDFParse } from 'pdf-parse';

try {
  if (typeof globalThis !== 'undefined' && !(globalThis as Record<string, unknown>).pdfjsWorker) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (globalThis as Record<string, unknown>).pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }
} catch {
  // Graceful fallback
}

export interface OcrProgressCallback {
  (message: string, progress?: number): void;
}

/**
 * Extracts text from a scanned or image-only PDF buffer using Tesseract OCR.
 * Renders pages to images via pdf-parse/canvas and runs OCR.
 */
export async function ocrExtractPdfBuffer(
  buffer: Buffer,
  onProgress?: OcrProgressCallback
): Promise<{ text: string; pagesCount: number }> {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    console.log(`[PDF OCR Debug] Starting OCR extraction for buffer (${buffer.length} bytes)...`);
  }

  onProgress?.('Rendering PDF pages for OCR scanning...', 0.1);

  const bufferCopy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const uint8Array = new Uint8Array(bufferCopy);
  const parser = new PDFParse({ data: uint8Array });

  let pageImages: Uint8Array[] = [];
  let totalPages = 1;

  try {
    // Attempt high-fidelity page rendering
    const screens = await parser.getScreenshot({ imageBuffer: true, scale: 1.5 });
    totalPages = screens.total || screens.pages.length || 1;

    for (const p of screens.pages) {
      if (p.data && p.data.length > 0) {
        pageImages.push(p.data);
      }
    }
  } catch (renderErr) {
    if (isDev) {
      console.warn('[PDF OCR Debug] Screenshot render failed, attempting image extraction fallback:', renderErr);
    }
    // Fallback to extracting embedded raster images
    try {
      const extractedImages = await parser.getImage({ imageBuffer: true });
      for (const p of extractedImages.pages) {
        for (const img of p.images) {
          if (img.data && img.data.length > 0) {
            pageImages.push(img.data);
          }
        }
      }
    } catch {
      // Both rendering methods failed
    }
  } finally {
    try {
      await parser.destroy();
    } catch {
      // ignore parser cleanup errors
    }
  }

  if (pageImages.length === 0) {
    if (isDev) {
      console.log('[PDF OCR Debug] No renderable pages or embedded images found for OCR.');
    }
    return { text: '', pagesCount: totalPages };
  }

  if (isDev) {
    console.log(`[PDF OCR Debug] Extracted ${pageImages.length} page images to process.`);
  }

  onProgress?.('Initializing OCR engine...', 0.25);

  let worker;
  try {
    let workerPath: string | undefined;
    try {
      // Resolve real physical path on disk to prevent bundlers (Turbopack) from passing virtual module IDs to Node Worker
      const path = await import('path');
      const fs = await import('fs');
      const physicalPath = path.join(
        process.cwd(),
        'node_modules',
        'tesseract.js',
        'src',
        'worker-script',
        'node',
        'index.js'
      );
      if (fs.existsSync(physicalPath)) {
        workerPath = physicalPath;
      }
    } catch {
      // fallback to default resolution
    }

    worker = await createWorker('eng', 1, workerPath ? { workerPath } : undefined);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PDF OCR Error] Failed to initialize Tesseract worker:', msg);
    return { text: '', pagesCount: totalPages };
  }

  const pageTexts: string[] = [];

  try {
    for (let i = 0; i < pageImages.length; i++) {
      const pageNum = i + 1;
      const progressPercent = 0.25 + ((i + 1) / pageImages.length) * 0.7;
      onProgress?.(
        `Performing OCR text recognition (Page ${pageNum} of ${pageImages.length})...`,
        progressPercent
      );

      const pageImg = Buffer.from(pageImages[i]);
      const result = await worker.recognize(pageImg);
      const recognized = (result.data?.text || '').trim();

      if (recognized.length > 0) {
        pageTexts.push(recognized);
      }

      if (isDev) {
        console.log(
          `[PDF OCR Debug] Page ${pageNum} recognized ${recognized.length} characters (confidence: ${result.data?.confidence || 0}%)`
        );
      }
    }
  } finally {
    try {
      await worker.terminate();
    } catch {
      // ignore worker termination error
    }
  }

  const fullOcrText = pageTexts.join('\n\n').trim();

  if (isDev) {
    console.log(`[PDF OCR Debug] OCR complete. Total extracted text length: ${fullOcrText.length}`);
  }

  return {
    text: fullOcrText,
    pagesCount: totalPages,
  };
}
