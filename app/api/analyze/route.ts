import { NextRequest, NextResponse } from 'next/server';
import { LegalLensDocument } from '@/types/document';
import { generateDocumentSummary } from '@/lib/ai/analyzeDocument';
import { detectAndClassifyClauses } from '@/lib/ai/analyzeClauses';
import { getUserSafeErrorMessage, logAnalysisDiagnostic } from '@/lib/validation/userSafeError';

export async function POST(req: NextRequest) {
  try {
    const customApiKey =
      req.headers.get('x-nvidia-api-key') ||
      req.headers.get('x-openrouter-api-key') ||
      req.headers.get('x-anthropic-api-key') ||
      undefined;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const doc = body.document as LegalLensDocument | undefined;
    const step = (body.step as 'all' | 'summary' | 'clauses' | undefined) || 'all';
    const skipCache =
      body.skipCache === true ||
      body.forceRefresh === true ||
      req.headers.get('x-skip-cache') === 'true' ||
      req.headers.get('x-force-refresh') === 'true';

    if (!doc || !doc.rawText || !doc.sections) {
      return NextResponse.json(
        { error: 'Valid document structure with text and sections is required.' },
        { status: 400 }
      );
    }

    const analysisOptions = { customApiKey, skipCache };

    // Step-specific execution: Summary only
    if (step === 'summary') {
      try {
        const { summary, updatedSections } = await generateDocumentSummary(
          doc.sections,
          analysisOptions
        );
        return NextResponse.json({
          ...doc,
          sections: updatedSections,
          summary,
        });
      } catch (err) {
        logAnalysisDiagnostic('summary', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('API_KEY')) {
          return NextResponse.json(
            { error: 'API_KEY_REQUIRED', message: 'NVIDIA NIM API Key is required.' },
            { status: 401 }
          );
        }
        const safe = getUserSafeErrorMessage(err, 'Failed to generate document summary.');
        return NextResponse.json({ error: safe }, { status: 500 });
      }
    }

    // Step-specific execution: Clauses only
    if (step === 'clauses') {
      try {
        const { clauses, lawyerChecklist, updatedSections } = await detectAndClassifyClauses(
          doc.rawText,
          doc.sections,
          analysisOptions
        );
        return NextResponse.json({
          ...doc,
          sections: updatedSections,
          clauses,
          lawyerChecklist,
        });
      } catch (err) {
        logAnalysisDiagnostic('clauses', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('API_KEY')) {
          return NextResponse.json(
            { error: 'API_KEY_REQUIRED', message: 'NVIDIA NIM API Key is required.' },
            { status: 401 }
          );
        }
        const safe = getUserSafeErrorMessage(err, 'Failed to detect clause attention flags.');
        return NextResponse.json({ error: safe }, { status: 500 });
      }
    }

    // Step 'all': Run summary and clause detection concurrently with error isolation
    const [summaryRes, clausesRes] = await Promise.allSettled([
      generateDocumentSummary(doc.sections, analysisOptions),
      detectAndClassifyClauses(doc.rawText, doc.sections, analysisOptions),
    ]);

    const errors: { summary?: string; clauses?: string } = {};

    let currentSummary = doc.summary;
    let currentClauses = doc.clauses;
    let currentChecklist = doc.lawyerChecklist;
    let currentSections = doc.sections;

    if (summaryRes.status === 'fulfilled') {
      currentSummary = summaryRes.value.summary;
      currentSections = summaryRes.value.updatedSections;
    } else {
      logAnalysisDiagnostic('summary', summaryRes.reason);
      errors.summary = getUserSafeErrorMessage(
        summaryRes.reason,
        'Something went wrong generating the plain summary — please try again.'
      );
    }

    if (clausesRes.status === 'fulfilled') {
      currentClauses = clausesRes.value.clauses;
      currentChecklist = clausesRes.value.lawyerChecklist;
      // Merge updated section flags if summary didn't already update sections
      if (summaryRes.status !== 'fulfilled') {
        currentSections = clausesRes.value.updatedSections;
      }
    } else {
      logAnalysisDiagnostic('clauses', clausesRes.reason);
      errors.clauses = getUserSafeErrorMessage(
        clausesRes.reason,
        'Something went wrong detecting clause attention flags — please try again.'
      );
    }

    // If both failed, return a 500 error
    if (summaryRes.status === 'rejected' && clausesRes.status === 'rejected') {
      const summaryMsg = String(summaryRes.reason || '');
      const clausesMsg = String(clausesRes.reason || '');

      if (summaryMsg.includes('API_KEY') || clausesMsg.includes('API_KEY')) {
        return NextResponse.json(
          {
            error: 'API_KEY_REQUIRED',
            message:
              'NVIDIA NIM API Key is required to perform AI analysis. Please configure your key in .env.local or via Settings.',
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'Something went wrong analyzing this document — please try again.' },
        { status: 500 }
      );
    }

    // At least one succeeded: return 200 with partial or full data and section errors attached
    const analyzedDocument: LegalLensDocument & { errors?: typeof errors } = {
      ...doc,
      sections: currentSections,
      summary: currentSummary,
      clauses: currentClauses,
      lawyerChecklist: currentChecklist,
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    };

    return NextResponse.json(analyzedDocument);
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error('[LegalLens Analyze Fatal Error]', err);

    if (
      rawMessage.includes('NVIDIA_API_KEY') ||
      rawMessage.includes('OPENROUTER_API_KEY') ||
      rawMessage.includes('ANTHROPIC_API_KEY')
    ) {
      return NextResponse.json(
        {
          error: 'API_KEY_REQUIRED',
          message:
            'NVIDIA NIM API Key is required to perform AI analysis. Please configure your key in .env.local or via Settings.',
        },
        { status: 401 }
      );
    }

    const safeMessage = getUserSafeErrorMessage(
      err,
      'Something went wrong analyzing this document — please try again.'
    );

    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

