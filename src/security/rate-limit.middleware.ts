import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  maxEntries?: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function createRateLimitMiddleware({
  limit,
  windowMs,
  maxEntries = 10_000,
}: RateLimitOptions) {
  const entries = new Map<string, RateLimitEntry>();

  function removeExpiredEntries(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let entry = entries.get(key);

    if (!entry || entry.resetAt <= now) {
      if (entries.size >= maxEntries) {
        removeExpiredEntries(now);
      }

      if (entries.size < maxEntries) {
        entry = { count: 0, resetAt: now + windowMs };
        entries.set(key, entry);
      }
    }

    if (!entry) {
      next();
      return;
    }

    entry.count += 1;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    );
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, limit - entry.count)),
    );
    response.setHeader(
      'RateLimit-Reset',
      String(Math.ceil(entry.resetAt / 1000)),
    );

    if (entry.count > limit) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(429).json({
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
      });
      return;
    }

    next();
  };
}
