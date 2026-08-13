import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Sends async rejections to the error middleware without depending on Express 5 doing it for us. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
