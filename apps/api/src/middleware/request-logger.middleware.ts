import pinoHttp from 'pino-http';
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger/logger';

/** One structured line per request, with level derived from status so `warn` filters to real problems. */
export const requestLogger: RequestHandler = pinoHttp({
  logger,

  genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',

  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,

  customProps: (req) => {
    const actor = (req as { auth?: { userId: string; businessId: string } }).auth;
    return actor ? { userId: actor.userId, businessId: actor.businessId } : {};
  },

  // Health checks would dominate log volume in a deployed environment with no diagnostic value.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/healthz',
  },

  // Pino's defaults log full headers, which would put cookies and bearer tokens in the log store.
  serializers: {
    req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
