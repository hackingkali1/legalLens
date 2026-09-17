import { NextRequest, NextResponse } from 'next/server';
import { validateUploadedFile, validatePastedText } from '@/lib/parsing/validator';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';
import {
  PdfPasswordProtectedError,
  PdfCorruptedError,
  PdfUnsupportedFormatError,
  PdfNoSelectableTextError,
} from '@/lib/parsing/errors';
import { parseRawText } from '@/lib/parsing/text';
import { splitIntoSections } from '@/lib/chunking/sectionSplitter';
import { createDocumentChunks } from '@/lib/chunking/tokenChunker';
import { LegalLensDocument } from '@/types/document';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let fileName = 'pasted-document.txt';
    let fileType: 'pdf' | 'docx' | 'txt' = 'txt';
    let rawText = '';
    let fileSize = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided in upload request.' }, { status: 400 });
      }

      fileName = file.name;
      fileSize = file.size;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate file size, type, and check magic bytes
      const validation = validateUploadedFile(fileName, fileSize, buffer);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      fileType = validation.detectedType || 'txt';

      if (fileType === 'pdf') {
        const { parsePdfBuffer } = await import('@/lib/parsing/pdf');
        const parsed = await parsePdfBuffer(buffer);
        rawText = parsed.text;
      } else if (fileType === 'docx') {
        const { parseDocxBuffer } = await import('@/lib/parsing/docx');
        const parsed = await parseDocxBuffer(buffer);
        rawText = parsed.text;
      } else {
        const textContent = buffer.toString('utf-8');
        const parsed = parseRawText(textContent);
        rawText = parsed.text;
      }
    } else {
      // JSON body with pasted text - route directly to text processing without file extension validation
      const body = await req.json();
      const text = body.text as string | undefined;
      // Document Title is stored purely as a display label, never parsed for file extension
      fileName =
        typeof body.fileName === 'string' && body.fileName.trim().length > 0
          ? body.fileName.trim()
          : 'Pasted Document';

      const validation = validatePastedText(text);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      fileSize = Buffer.byteLength(text!, 'utf-8');
      const parsed = parseRawText(text!);
      rawText = parsed.text;
      fileType = 'txt';
    }

    // Security: Log file metadata only, never full contents, titles, or sensitive PII
    console.log(
      `[LegalLens Upload] Processed document (${fileType}, ${fileSize} bytes, status: success)`
    );

    // Section and chunk creation
    const sections = splitIntoSections(rawText);
    const chunks = createDocumentChunks(sections);

    const doc: LegalLensDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName,
      fileSize,
      fileType,
      uploadedAt: new Date().toISOString(),
      rawText,
      sections,
      chunks,
      clauses: [],
      lawyerChecklist: [],
    };

    return NextResponse.json(doc);
  } catch (err: unknown) {
    if (err instanceof PdfPasswordProtectedError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    if (err instanceof PdfCorruptedError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof PdfUnsupportedFormatError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 415 });
    }
    if (err instanceof PdfNoSelectableTextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }

    const message = getUserSafeErrorMessage(err, 'Failed to process document upload.');
    console.error('[LegalLens Upload Error]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
