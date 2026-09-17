import { ZodError } from 'zod';

/**
 * Ensures error messages returned to end users or UI are plain-language and never
 * expose internal Zod schema validation dumps, stack traces, or internal error objects.
 */
export function getUserSafeErrorMessage(
  err: unknown,
  fallbackMessage = 'An unexpected error occurred. Please try again.'
): string {
  // Always log raw error server-side for developer debugging
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Internal Error Detail]', err);
  }

  if (!err) {
    return fallbackMessage;
  }

  // Handle Zod validation errors directly
  if (err instanceof ZodError || (typeof err === 'object' && err !== null && 'issues' in err)) {
    return fallbackMessage;
  }

  const rawMessage = err instanceof Error ? err.message : String(err);
  const rawLower = rawMessage.toLowerCase();

  // Detect serialized raw Zod error JSON strings e.g. [{"expected":"object","code":"invalid_type",...}]
  if (
    rawMessage.includes('"expected"') &&
    rawMessage.includes('"code"') &&
    (rawMessage.startsWith('[') || rawMessage.startsWith('{'))
  ) {
    return fallbackMessage;
  }

  // Detect internal file paths or stack traces
  if (
    rawMessage.includes('node_modules') ||
    /(?:\r?\n)\s*at\s+/.test(rawMessage) ||
    rawMessage.includes('webpack-internal')
  ) {
    return fallbackMessage;
  }

  // Detect internal technical error strings (status codes, rate limits, timeouts, upstream service names, network/fetch/parser errors)
  if (
    rawMessage.includes('NVIDIA') ||
    rawLower.includes('rate limit') ||
    rawLower.includes('timed out') ||
    rawLower.includes('timeout') ||
    rawMessage.includes('status ') ||
    rawMessage.includes('ECONN') ||
    rawLower.includes('fetch failed') ||
    rawLower.includes('failed to fetch') ||
    rawLower.includes('networkerror') ||
    rawLower.includes('typeerror') ||
    rawLower.includes('syntaxerror') ||
    rawLower.includes('unexpected token') ||
    rawLower.includes('is not valid json') ||
    rawLower.includes('load failed') ||
    rawLower.includes('aborted')
  ) {
    return fallbackMessage;
  }

  // If message looks clean and user-friendly, return it; otherwise fallback
  return rawMessage || fallbackMessage;
}

export interface AnalysisDiagnostic {
  errorType: 'rate-limit' | 'timeout' | 'json-parse' | 'schema-validation' | 'network' | 'auth' | 'unknown';
  statusCode: number;
  reason: string;
}

export function classifyAnalysisError(err: unknown): AnalysisDiagnostic {
  if (!err) {
    return {
      errorType: 'unknown',
      statusCode: 500,
      reason: '500 unknown: An unspecified error occurred',
    };
  }

  // Handle Zod validation errors directly
  if (err instanceof ZodError || (typeof err === 'object' && err !== null && 'issues' in err)) {
    const issueSummary =
      err instanceof ZodError
        ? err.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ')
        : 'Invalid schema';
    return {
      errorType: 'schema-validation',
      statusCode: 422,
      reason: `422 schema-validation: Model structured output failed schema validation (${issueSummary})`,
    };
  }

  const rawMessage = (err instanceof Error ? err.message : String(err)).replace(/\r?\n/g, ' ').slice(0, 250);
  const statusProp = (err as any)?.status || (err as any)?.statusCode;
  const statusNum = typeof statusProp === 'number' ? statusProp : undefined;

  // 1. Rate limit (429)
  if (
    statusNum === 429 ||
    rawMessage.includes('429') ||
    rawMessage.toLowerCase().includes('rate limit') ||
    rawMessage.toLowerCase().includes('too many requests') ||
    rawMessage.toLowerCase().includes('quota')
  ) {
    return {
      errorType: 'rate-limit',
      statusCode: 429,
      reason: `429 rate-limit: Upstream API rate limit or concurrency quota exceeded (${rawMessage})`,
    };
  }

  // 2. Timeout (504)
  if (
    statusNum === 504 ||
    rawMessage.toLowerCase().includes('timeout') ||
    rawMessage.toLowerCase().includes('timed out') ||
    rawMessage.includes('ETIMEDOUT') ||
    rawMessage.includes('ESOCKETTIMEDOUT')
  ) {
    return {
      errorType: 'timeout',
      statusCode: 504,
      reason: `504 timeout: Upstream model completion timed out (${rawMessage})`,
    };
  }

  // 3. JSON parse failure (502)
  if (
    rawMessage.includes('JSON') ||
    rawMessage.includes('SyntaxError') ||
    rawMessage.includes('Failed to parse AI structured response') ||
    rawMessage.includes('Unexpected token')
  ) {
    return {
      errorType: 'json-parse',
      statusCode: 502,
      reason: `502 json-parse: AI model returned non-JSON or malformed payload (${rawMessage})`,
    };
  }

  // 4. Authentication / Authorization (401 / 403)
  if (
    statusNum === 401 ||
    statusNum === 403 ||
    rawMessage.includes('401') ||
    rawMessage.includes('403') ||
    rawMessage.toLowerCase().includes('unauthorized') ||
    rawMessage.includes('API_KEY')
  ) {
    const code = statusNum === 403 ? 403 : 401;
    return {
      errorType: 'auth',
      statusCode: code,
      reason: `${code} auth: API key is missing, unauthorized, or invalid (${rawMessage})`,
    };
  }

  // 5. Network connectivity failure (503)
  if (
    statusNum === 503 ||
    rawMessage.includes('fetch failed') ||
    rawMessage.includes('ECONNREFUSED') ||
    rawMessage.includes('ENOTFOUND') ||
    rawMessage.includes('ECONNRESET') ||
    rawMessage.toLowerCase().includes('network')
  ) {
    return {
      errorType: 'network',
      statusCode: 503,
      reason: `503 network: Network connectivity failure connecting to upstream model service (${rawMessage})`,
    };
  }

  // 6. Schema validation encoded in message string
  if (rawMessage.includes('"expected"') && rawMessage.includes('"code"')) {
    return {
      errorType: 'schema-validation',
      statusCode: 422,
      reason: `422 schema-validation: Structured response format mismatch (Zod) (${rawMessage})`,
    };
  }

  const finalStatus = statusNum || 500;
  return {
    errorType: 'unknown',
    statusCode: finalStatus,
    reason: `${finalStatus} unknown: ${rawMessage || 'Unexpected server error'}`,
  };
}

export function logAnalysisDiagnostic(step: string, err: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    const diag = classifyAnalysisError(err);
    console.warn(
      `[LegalLens Analysis Debug] Step: ${step} | Status: ${diag.statusCode} | ErrorType: ${diag.errorType} | Reason: ${diag.reason}`
    );
  }
}

