import { LegalLensDocument } from '@/types/document';
import { getSessionApiKey } from '@/components/settings/ApiKeyModal';

export interface AnalyzeDocumentApiOptions {
  step?: 'all' | 'summary' | 'clauses';
  skipCache?: boolean;
  customApiKey?: string;
}

export interface AnalyzeDocumentApiResponse extends LegalLensDocument {
  errors?: {
    summary?: string;
    clauses?: string;
  };
}

/**
 * Client service function to execute document analysis requests against /api/analyze.
 * Encapsulates session key headers, cache-busting flags, and error extraction.
 */
export async function analyzeDocumentApi(
  document: LegalLensDocument,
  options: AnalyzeDocumentApiOptions = {}
): Promise<AnalyzeDocumentApiResponse> {
  const { step = 'all', skipCache = false, customApiKey } = options;

  const sessionKey = customApiKey || getSessionApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionKey) {
    headers['x-nvidia-api-key'] = sessionKey;
    headers['x-openrouter-api-key'] = sessionKey;
  }

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({ document, step, skipCache }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Analysis failed.');
  }

  return data as AnalyzeDocumentApiResponse;
}
