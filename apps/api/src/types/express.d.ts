import type { AuthenticatedActor } from '../modules/auth/auth.types';
import type { ValidatedRequestData } from '../middleware/validate.middleware';

/**
 * Express request augmentation.
 *
 * `auth` is populated exclusively by the authentication middleware, so any
 * handler that reads it is guaranteed to sit behind that middleware. `requestId`
 * is attached at the very front of the chain and threaded through logs and
 * error responses for end-to-end correlation. `validated` holds schema output
 * because Express 5 makes `req.query` read-only.
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthenticatedActor;
      validated: ValidatedRequestData<unknown, unknown, unknown>;
    }
  }
}

export {};
