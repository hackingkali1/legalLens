import { LegalLensDocument } from '@/types/document';

export interface AnalyzeDocumentApiOptions {
  step?: 'all' | 'summary' | 'clauses';
  skipCache?: boolean;
}

export interface AnalyzeDocumentApiResponse extends LegalLensDocument {
  errors?: {
    summary?: string;
    clauses?: string;
  };
}

/**
 * Client service function to execute document analysis requests against /api/analyze.
 * Relies exclusively on server-side NVIDIA_API_KEY environment variable.
 */
export async function analyzeDocumentApi(
  document: LegalLensDocument,
  options: AnalyzeDocumentApiOptions = {}
): Promise<AnalyzeDocumentApiResponse> {
  const { step = 'all', skipCache = false } = options;

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ document, step, skipCache }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Analysis failed.');
  }

  return data as AnalyzeDocumentApiResponse;
}
