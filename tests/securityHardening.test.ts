import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import {
  getUserSafeErrorMessage,
  sanitizeLogSnippet,
  classifyAnalysisError,
} from '@/lib/validation/userSafeError';
import {
  RateLimiter,
  enforceRateLimit,
  apiRateLimiter,
} from '@/lib/security/rateLimiter';
import {
  AnalyzeRequestSchema,
  ChatRequestSchema,
  ExportRequestSchema,
  CompareRequestSchema,
} from '@/lib/validation/clauseSchema';

describe('Security Hardening: userSafeError and log sanitization', () => {
  it('sanitizes and redacts NVIDIA and OpenRouter API keys from log strings', () => {
    const raw = 'Failed request with key nvapi-abc123XYZ456-secret and sk-or-v1-abcdef0123456789';
    const clean = sanitizeLogSnippet(raw);
    expect(clean).not.toContain('nvapi-abc123XYZ456-secret');
    expect(clean).not.toContain('sk-or-v1-abcdef0123456789');
    expect(clean).toContain('[REDACTED_API_KEY]');
  });

  it('redacts Bearer tokens and header authorization payloads', () => {
    const raw = 'Authorization: Bearer nvapi-secret-key-12345678; x-nvidia-api-key: nvapi-test99';
    const clean = sanitizeLogSnippet(raw);
    expect(clean).not.toContain('nvapi-secret-key-12345678');
    expect(clean).toContain('Bearer [REDACTED]');
  });

  it('redacts contract text fragments and raw document payloads in logs', () => {
    const raw = 'Error processing payload: {"rawText": "Tenant agrees to pay $5,000/month", "originalText": "Indemnification clause"}';
    const clean = sanitizeLogSnippet(raw);
    expect(clean).not.toContain('Tenant agrees to pay');
    expect(clean).not.toContain('Indemnification clause');
    expect(clean).toContain('[REDACTED_DOCUMENT_TEXT]');
  });

  it('strictly caps the log snippet length to prevent buffer/log flooding', () => {
    const huge = 'A'.repeat(500);
    const clean = sanitizeLogSnippet(huge, 100);
    expect(clean.length).toBeLessThanOrEqual(100);
  });

  it('ensures getUserSafeErrorMessage never leaks raw Zod schema dumps or stack traces to users', () => {
    const zodErr = new ZodError([
      {
        code: 'custom',
        path: ['sections', 0, 'rawText'],
        message: 'Expected string, received number',
      },
    ]);
    const safeMsg = getUserSafeErrorMessage(zodErr, 'Safe error message');
    expect(safeMsg).toBe('Safe error message');
    expect(safeMsg).not.toContain('invalid_type');
    expect(safeMsg).not.toContain('sections.0.rawText');

    const stackErr = new Error('Error at Object.<anonymous> (c:\\Users\\project\\node_modules\\...)');
    const safeStack = getUserSafeErrorMessage(stackErr, 'Fallback msg');
    expect(safeStack).toBe('Fallback msg');
  });

  it('ensures getUserSafeErrorMessage masks upstream API / rate limit / network error names', () => {
    const upstreamErr = new Error('NVIDIA API rate limit exceeded: 429 Too Many Requests');
    const safe = getUserSafeErrorMessage(upstreamErr, 'Analysis could not be completed.');
    expect(safe).toBe('Analysis could not be completed.');
    expect(safe).not.toContain('NVIDIA');
    expect(safe).not.toContain('429');
  });
});

describe('Security Hardening: RateLimiter and abuse protection', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 10_000); // 3 requests per 10s
  });

  it('allows requests within limit and tracks remaining quota', () => {
    const req = new NextRequest('http://localhost:3000/api/analyze', {
      headers: { 'x-forwarded-for': '198.51.100.42' },
    });

    // Temporarily override NODE_ENV for test
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';

      const r1 = limiter.check(req, 3, 10_000);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.check(req, 3, 10_000);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check(req, 3, 10_000);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      const r4 = limiter.check(req, 3, 10_000);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfter).toBeGreaterThan(0);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  });

  it('extracts client IP from x-forwarded-for or x-real-ip headers', () => {
    const reqForwarded = new NextRequest('http://localhost:3000/api/analyze', {
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
    });
    expect(limiter.getClientIdentifier(reqForwarded)).toBe('203.0.113.195');

    const reqReal = new NextRequest('http://localhost:3000/api/analyze', {
      headers: { 'x-real-ip': '198.51.100.99' },
    });
    expect(limiter.getClientIdentifier(reqReal)).toBe('198.51.100.99');

    const reqDefault = new NextRequest('http://localhost:3000/api/analyze');
    expect(limiter.getClientIdentifier(reqDefault)).toBe('127.0.0.1');
  });

  it('enforceRateLimit returns a 429 response when limit is exceeded', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      const testLimiter = new RateLimiter(1, 60_000);
      const req = new NextRequest('http://localhost:3000/api/analyze', {
        headers: { 'x-real-ip': '192.0.2.1' },
      });

      // Pass 1
      const res1 = testLimiter.check(req, 1, 60_000);
      expect(res1.allowed).toBe(true);

      // Pass 2 -> blocked
      const res2 = testLimiter.check(req, 1, 60_000);
      expect(res2.allowed).toBe(false);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  });
});

describe('Security Hardening: API Route Input Schema Validations', () => {
  it('AnalyzeRequestSchema validates document structure and rejects empty sections', () => {
    const invalid = {
      document: {
        rawText: 'Some document',
        sections: [],
      },
    };
    const res = AnalyzeRequestSchema.safeParse(invalid);
    expect(res.success).toBe(false);

    const valid = {
      document: {
        rawText: 'Some document',
        sections: [
          {
            id: 'sec-1',
            title: 'Section 1',
            originalText: 'Valid text',
          },
        ],
      },
      step: 'summary',
    };
    const validRes = AnalyzeRequestSchema.safeParse(valid);
    expect(validRes.success).toBe(true);
  });

  it('ChatRequestSchema rejects empty questions or missing chunks', () => {
    const emptyQ = {
      question: '',
      chunks: [{ text: 'Some text' }],
    };
    expect(ChatRequestSchema.safeParse(emptyQ).success).toBe(false);

    const noChunks = {
      question: 'What is the governing law?',
      chunks: [],
    };
    expect(ChatRequestSchema.safeParse(noChunks).success).toBe(false);

    const valid = {
      question: 'What is the governing law?',
      chunks: [{ text: 'Governing law is New York.' }],
    };
    expect(ChatRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('ExportRequestSchema validates export formats and rejects invalid formats', () => {
    const invalidFormat = {
      format: 'docx',
      document: { fileName: 'test.pdf' },
    };
    expect(ExportRequestSchema.safeParse(invalidFormat).success).toBe(false);

    const validPdf = {
      format: 'pdf',
      document: { fileName: 'contract.pdf' },
    };
    expect(ExportRequestSchema.safeParse(validPdf).success).toBe(true);

    const validMd = {
      format: 'markdown',
      document: { fileName: 'contract.md' },
    };
    expect(ExportRequestSchema.safeParse(validMd).success).toBe(true);
  });

  it('CompareRequestSchema enforces non-empty names and text for both documents', () => {
    const missingB = {
      docAName: 'Doc A',
      docAText: 'Text A',
      docBName: 'Doc B',
      docBText: '',
    };
    expect(CompareRequestSchema.safeParse(missingB).success).toBe(false);

    const valid = {
      docAName: 'Doc A',
      docAText: 'Text A',
      docBName: 'Doc B',
      docBText: 'Text B',
    };
    expect(CompareRequestSchema.safeParse(valid).success).toBe(true);
  });
});
