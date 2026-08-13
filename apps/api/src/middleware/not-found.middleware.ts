import type { NextFunction, Request, Response } from 'express';
import { API_ERROR_CODES } from '@appointly/shared';
import { createAppError } from '../lib/errors/app-error';

/** Turns an unmatched route into a domain error; Express would otherwise answer HTML, breaking the JSON envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    createAppError({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: `Cannot ${req.method} ${req.originalUrl}`,
    }),
  );
}
