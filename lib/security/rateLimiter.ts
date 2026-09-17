import { NextRequest, NextResponse } from 'next/server';

interface RateLimitRecord {
  timestamps: number[];
}

/**
 * Sliding-window in-memory rate limiter for public API abuse protection.
 */
export class RateLimiter {
  private requests = new Map<string, RateLimitRecord>();
  private defaultLimit: number;
  private defaultWindowMs: number;

  constructor(defaultLimit = 120, defaultWindowMs = 60_000) {
    this.defaultLimit = defaultLimit;
    this.defaultWindowMs = defaultWindowMs;
  }

  /**
   * Extracts client identifier from IP headers, falling back to localhost.
   */
  public getClientIdentifier(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      const clientIp = forwarded.split(',')[0]?.trim();
      if (clientIp) return clientIp;
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp && realIp.trim().length > 0) {
      return realIp.trim();
    }
    return '127.0.0.1';
  }

  /**
   * Checks whether the request is allowed under the rate limit window.
   */
  public check(
    req: NextRequest,
    limit = this.defaultLimit,
    windowMs = this.defaultWindowMs
  ): { allowed: boolean; remaining: number; retryAfter: number } {
    // Disable rate limiting in test environments so automated suites run unrestricted
    if (process.env.NODE_ENV === 'test') {
      return { allowed: true, remaining: 999, retryAfter: 0 };
    }

    const clientId = this.getClientIdentifier(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.requests.get(clientId);
    if (!record) {
      record = { timestamps: [] };
      this.requests.set(clientId, record);
    }

    // Filter out timestamps older than the window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= limit) {
      const oldestInWindow = record.timestamps[0];
      const retryAfter = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
      };
    }

    record.timestamps.push(now);

    // Periodic sweep if cache size grows large
    if (this.requests.size > 2000) {
      this.sweep(windowStart);
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - record.timestamps.length),
      retryAfter: 0,
    };
  }

  private sweep(cutoff: number): void {
    for (const [key, rec] of this.requests.entries()) {
      rec.timestamps = rec.timestamps.filter((ts) => ts > cutoff);
      if (rec.timestamps.length === 0) {
        this.requests.delete(key);
      }
    }
  }

  public clear(): void {
    this.requests.clear();
  }
}

export const apiRateLimiter = new RateLimiter(120, 60_000);

/**
 * Standardized rate-limit enforcement check for Next.js route handlers.
 * Returns null if allowed, or a 429 NextResponse if rate limit is exceeded.
 */
export function enforceRateLimit(
  req: NextRequest,
  limit = 120,
  windowMs = 60_000
): NextResponse | null {
  const result = apiRateLimiter.check(req, limit, windowMs);
  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests. Please wait a moment before trying again.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }
  return null;
}
