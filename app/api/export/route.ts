import { NextRequest, NextResponse } from 'next/server';
import { LegalLensDocument } from '@/types/document';
import { generateDocumentMarkdown } from '@/lib/export/markdown';
import { generateDocumentPdfBuffer } from '@/lib/export/pdf';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';
import { ExportRequestSchema } from '@/lib/validation/clauseSchema';
import { enforceRateLimit } from '@/lib/security/rateLimiter';

export async function POST(req: NextRequest) {
  try {
    const rateLimitRes = enforceRateLimit(req, 120);
    if (rateLimitRes) return rateLimitRes;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const parsed = ExportRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Valid export request with format (pdf|markdown) and document is required.' },
        { status: 400 }
      );
    }

    const { format } = parsed.data;
    const doc = parsed.data.document as unknown as LegalLensDocument;

    const safeBaseName = doc.fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);

    if (format === 'markdown') {
      const mdContent = generateDocumentMarkdown(doc);
      return new NextResponse(mdContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="legallens_${safeBaseName}.md"`,
        },
      });
    } else {
      const pdfBuffer = generateDocumentPdfBuffer(doc);
      return new NextResponse(pdfBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="legallens_${safeBaseName}.pdf"`,
        },
      });
    }
  } catch (err: unknown) {
    console.error('[LegalLens Export Error]', err);
    const safeMessage = getUserSafeErrorMessage(err, 'Failed to export document. Please try again.');
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

