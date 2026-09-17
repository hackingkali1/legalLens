import { NextRequest, NextResponse } from 'next/server';
import { compareTwoDocuments } from '@/lib/ai/compareDocuments';
import { CompareRequestSchema } from '@/lib/validation/clauseSchema';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';
import { sessionAnalysisCache } from '@/lib/cache/analysisCache';
import { DocumentDiffResult } from '@/types/compare';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const customApiKey =
      req.headers.get('x-nvidia-api-key') ||
      req.headers.get('x-openrouter-api-key') ||
      req.headers.get('x-anthropic-api-key') ||
      undefined;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    const parsedBody = CompareRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error:
            'Invalid comparison request. Please provide valid text for both Document A and Document B.',
        },
        { status: 400 }
      );
    }

    const {
      docAName,
      docAText,
      docBName,
      docBText,
      skipCache: bodySkipCache,
      forceRefresh: bodyForceRefresh,
    } = parsedBody.data;

    const skipCache =
      bodySkipCache === true ||
      bodyForceRefresh === true ||
      req.headers.get('x-skip-cache') === 'true' ||
      req.headers.get('x-force-refresh') === 'true';

    const compareHash = sessionAnalysisCache.computeHash(
      `${docAName}|||${docAText}|||${docBName}|||${docBText}`
    );
    const cacheKey = `doc-compare:${compareHash}`;

    if (!skipCache) {
      const cached = sessionAnalysisCache.get<DocumentDiffResult>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const diffResult = await compareTwoDocuments(
      docAName,
      docAText,
      docBName,
      docBText,
      customApiKey
    );

    sessionAnalysisCache.set(cacheKey, diffResult);

    return NextResponse.json(diffResult);
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error('[LegalLens Compare Error]', err);

    if (
      rawMessage.includes('NVIDIA_API_KEY') ||
      rawMessage.includes('OPENROUTER_API_KEY') ||
      rawMessage.includes('ANTHROPIC_API_KEY')
    ) {
      return NextResponse.json(
        {
          error: 'API_KEY_REQUIRED',
          message:
            'NVIDIA NIM API Key is required to compare documents. Please configure your key in .env.local or via Settings.',
        },
        { status: 401 }
      );
    }

    const safeMessage = getUserSafeErrorMessage(
      err,
      'Something went wrong comparing these documents — please try again.'
    );

    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

