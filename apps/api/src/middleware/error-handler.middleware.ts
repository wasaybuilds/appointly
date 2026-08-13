import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES, type ApiErrorResponse } from '@appointly/shared';
import { env } from '../config/env';
import { isAppError } from '../lib/errors/app-error';
import { createLogger } from '../lib/logger/logger';

// Unexpected errors are logged in full but answered with a bare 500: internal messages
// and stack traces are reconnaissance material and never cross the wire.

const log = createLogger('http.error');

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Once headers are on the wire, Express's default handler must take over; writing a body here throws.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isAppError(error)) {
    const level = error.statusCode >= 500 ? 'error' : 'warn';

    log[level](
      {
        requestId: req.requestId,
        code: error.code,
        statusCode: error.statusCode,
        context: error.context,
        err: error.statusCode >= 500 ? error : undefined,
      },
      error.message,
    );

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
        requestId: req.requestId,
      },
    };

    res.status(error.statusCode).json(body);
    return;
  }

  log.error({ requestId: req.requestId, err: error, path: req.originalUrl }, 'Unhandled error');

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: 'Something went wrong on our side. Please try again.',
      requestId: req.requestId,
    },
  };

  // Raw message only outside production, purely to shorten the local debugging loop.
  if (!env.isProduction && error instanceof Error) {
    body.error.message = error.message;
  }

  res.status(500).json(body);
};
