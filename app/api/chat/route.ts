import { NextRequest, NextResponse } from 'next/server';
import { DocumentChunk } from '@/types/document';
import { answerDocumentQuestion } from '@/lib/ai/answerQuestion';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';

export async function POST(req: NextRequest) {
  try {
    const customApiKey =
      req.headers.get('x-nvidia-api-key') ||
      req.headers.get('x-openrouter-api-key') ||
      req.headers.get('x-anthropic-api-key') ||
      undefined;
    const body = await req.json();
    const question = body.question as string | undefined;
    const chunks = body.chunks as DocumentChunk[] | undefined;
    const rawText = body.rawText as string | undefined;

    if (!question || question.trim().length === 0) {
      return NextResponse.json({ error: 'Question cannot be empty.' }, { status: 400 });
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ error: 'Document chunks are required for Q&A.' }, { status: 400 });
    }

    const skipCache =
      body.skipCache === true ||
      body.forceRefresh === true ||
      req.headers.get('x-skip-cache') === 'true' ||
      req.headers.get('x-force-refresh') === 'true';

    const chatResponse = await answerDocumentQuestion(
      question.trim(),
      chunks,
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

