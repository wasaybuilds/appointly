import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler.middleware';
import { notFoundHandler } from './middleware/not-found.middleware';
import { generalRateLimit } from './middleware/rate-limit.middleware';
import { requestContext } from './middleware/request-context.middleware';
import { requestLogger } from './middleware/request-logger.middleware';
import { API_PREFIX, apiRouter } from './routes';

/** Middleware order below is a security property, not style: trust proxy (real client IPs, which the rate
 * limiter needs), helmet, CORS, correlation id, logging, body cap, rate limit, routes, 404, error handler last. */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // A JSON API on a separate origin is not a browser document, so helmet's default policies do not apply.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.webOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86_400,
    }),
  );

  app.use(requestContext);
  app.use(requestLogger);

  // 100kb is generous for a chat message and small enough to reject oversized bodies before parsing.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(compression());

  // Outside the rate limiter and the API prefix: a platform health check must never be throttled or versioned.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(API_PREFIX, generalRateLimit, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
