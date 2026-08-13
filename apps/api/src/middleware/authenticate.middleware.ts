import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { errors } from '../lib/errors/app-error';
import { ACCESS_TOKEN_COOKIE } from '../modules/auth/auth.cookies';
import { verifyAccessToken } from '../modules/auth/token.service';
import type { AuthenticatedActor, UserRole } from '../modules/auth/auth.types';

/** Cookie first: an httpOnly token is one XSS cannot steal. The header keeps non-browser clients working. */
function readAccessToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
    ACCESS_TOKEN_COOKIE
  ];

  if (cookieToken) {
    return cookieToken;
  }

  const header = req.header('authorization');

  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice('bearer '.length).trim();
  }

  return null;
}

/** Rejects the request unless it carries a valid token; on success `req.auth` carries the tenant scope. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = readAccessToken(req);

  if (!token) {
    next(errors.unauthorized());
    return;
  }

  // Letting the typed 401 propagate keeps "expired" and "invalid" distinguishable for the client.
  const payload = verifyAccessToken(token);

  const actor: AuthenticatedActor = {
    userId: payload.sub,
    businessId: payload.businessId,
    email: payload.email,
    role: payload.role,
  };

  req.auth = actor;
  next();
}

/** Attaches `req.auth` when a valid token is present, but never rejects. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = readAccessToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      businessId: payload.businessId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // An unusable token is treated as no token; the route is public by design.
  }

  next();
}

/** Restricts a route to the given roles. Must be mounted after {@link authenticate}. */
export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(errors.unauthorized());
      return;
    }

    if (!allowed.includes(req.auth.role)) {
      next(errors.forbidden());
      return;
    }

    next();
  };
}

/** Actor accessor for controllers: an unguarded route fails as a clean 401, not a TypeError in a service. */
export function requireActor(req: Request): AuthenticatedActor {
  if (!req.auth) {
    throw errors.unauthorized();
  }
  return req.auth;
}
