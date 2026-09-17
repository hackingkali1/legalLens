import { NextRequest, NextResponse } from 'next/server';
import { DocumentChunk } from '@/types/document';
import { answerDocumentQuestion } from '@/lib/ai/answerQuestion';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';
import { ChatRequestSchema } from '@/lib/validation/clauseSchema';
import { enforceRateLimit } from '@/lib/security/rateLimiter';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const rateLimitRes = enforceRateLimit(req, 120);
    if (rateLimitRes) return rateLimitRes;

    const customApiKey =
      req.headers.get('x-nvidia-api-key') ||
      req.headers.get('x-openrouter-api-key') ||
      req.headers.get('x-anthropic-api-key') ||
      undefined;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issueMsg = parsed.error.issues[0]?.message || 'Invalid question or document chunks.';
      return NextResponse.json({ error: issueMsg }, { status: 400 });
    }

    const { question, chunks, rawText } = parsed.data;

    const skipCache =
      parsed.data.skipCache === true ||
      parsed.data.forceRefresh === true ||
      req.headers.get('x-skip-cache') === 'true' ||
      req.headers.get('x-force-refresh') === 'true';

    const chatResponse = await answerDocumentQuestion(
      question.trim(),
      chunks as unknown as DocumentChunk[],
      rawText || '',
      { customApiKey, skipCache }
    );

    return NextResponse.json(chatResponse);
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error('[LegalLens Chat Error]', err);

    if (
      rawMessage.includes('NVIDIA_API_KEY') ||
      rawMessage.includes('OPENROUTER_API_KEY') ||
      rawMessage.includes('ANTHROPIC_API_KEY')
    ) {
      return NextResponse.json(
        {
          error: 'API_KEY_REQUIRED',
          message:
            'NVIDIA NIM API Key is required to ask questions about the document. Please configure your key in .env.local or via Settings.',
        },
        { status: 401 }
      );
    }

    const safeMessage = getUserSafeErrorMessage(
      err,
      'Something went wrong answering your question — please try again.'
    );

    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

