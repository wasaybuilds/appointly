import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { API_ERROR_CODES, type ApiErrorResponse } from '@appointly/shared';
import { env } from '../config/env';
import { createLogger } from '../lib/logger/logger';

const log = createLogger('middleware.rate-limit');

/** Buckets per user, not per raw IP: one aggressive client behind a shared NAT would drain everyone's quota. */
function resolveClientKey(req: Request): string {
  if (req.auth) {
    return `user:${req.auth.userId}`;
  }

  if (!req.ip) {
    return 'ip:unknown';
  }

  // ipKeyGenerator collapses IPv6 to its /64; a client owning a whole /64 could otherwise rotate past the limit.
  return `ip:${ipKeyGenerator(req.ip)}`;
}

function buildLimiter(name: string, max: number, extra: Partial<Options> = {}): RequestHandler {
  return rateLimit({
    windowMs: env.rateLimit.windowMs,
    max,
    keyGenerator: resolveClientKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      log.warn({ key: resolveClientKey(req), path: req.originalUrl, limiter: name }, 'Rate limited');

      const body: ApiErrorResponse = {
        success: false,
        error: {
          code: API_ERROR_CODES.RATE_LIMITED,
          message: 'Too many requests. Please wait a moment and try again.',
          requestId: req.requestId,
        },
      };

      res.status(429).json(body);
    },
    ...extra,
  });
}

/** Baseline limit for the whole API. Counters are in-process; scaling out needs a shared store (Redis). */
export const generalRateLimit: RequestHandler = buildLimiter('general', env.rateLimit.max);

/** Credential endpoints; successful sign-ins are not counted, so probing from one address cannot lock out a real user. */
export const authRateLimit: RequestHandler = buildLimiter('auth', env.rateLimit.authMax, {
  skipSuccessfulRequests: true,
});

/** Limits how fast a single user can drive paid model calls. */
export const chatRateLimit: RequestHandler = buildLimiter('chat', env.rateLimit.chatMax);
