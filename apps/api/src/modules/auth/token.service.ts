import { createHash, randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { errors } from '../../lib/errors/app-error';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';

/** Access tokens stay stateless; refresh tokens are stored and rotated so sessions remain revocable. */

const ACCESS_AUDIENCE = 'appointly:access';
const REFRESH_AUDIENCE = 'appointly:refresh';
const TOKEN_ISSUER = 'appointly-api';

export interface SignedToken {
  token: string;
  /** Absolute expiry, taken from the signed claims rather than recomputed. */
  expiresAt: Date;
  expiresInSeconds: number;
}

/** Signs a short-lived access token. */
export function signAccessToken(payload: AccessTokenPayload): SignedToken {
  return sign(payload, env.auth.accessSecret, env.auth.accessTtl, ACCESS_AUDIENCE);
}

/** Signs a refresh token bound to a stored `refresh_tokens` row via its `jti`. */
export function signRefreshToken(userId: string, tokenId: string): SignedToken {
  const payload: RefreshTokenPayload = { sub: userId, jti: tokenId };
  return sign(payload, env.auth.refreshSecret, env.auth.refreshTtl, REFRESH_AUDIENCE);
}

/** Verifies an access token; throws 401 when expired, tampered with, or of the wrong audience. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.auth.accessSecret, {
      audience: ACCESS_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });

    if (typeof decoded === 'string' || !isAccessPayload(decoded)) {
      throw errors.unauthorized('Your session is not valid. Please sign in again.');
    }

    return {
      sub: decoded.sub,
      businessId: decoded.businessId,
      email: decoded.email,
      role: decoded.role,
    };
  } catch (error) {
    // Expiry gets its own code so the client can refresh silently instead of bouncing to login.
    if (error instanceof jwt.TokenExpiredError) {
      throw errors.tokenExpired();
    }
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
      throw errors.unauthorized('Your session is not valid. Please sign in again.');
    }
    throw error;
  }
}

/** Verifies a refresh token's signature; the caller must still confirm the `jti` row is live. */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.auth.refreshSecret, {
      audience: REFRESH_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });

    if (typeof decoded === 'string' || !isRefreshPayload(decoded)) {
      throw errors.unauthorized('Your session has ended. Please sign in again.');
    }

    return { sub: decoded.sub, jti: decoded.jti };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      throw errors.unauthorized('Your session has ended. Please sign in again.');
    }
    throw error;
  }
}

/** Hashes a refresh token for storage; unsalted SHA-256 suffices as the input is not guessable. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Generates the identifier shared by the stored row and the token's `jti`. */
export function createRefreshTokenId(): string {
  return randomUUID();
}

function sign(
  payload: object,
  secret: string,
  expiresIn: string,
  audience: string,
): SignedToken {
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
    audience,
    issuer: TOKEN_ISSUER,
  };

  const token = jwt.sign(payload, secret, options);
  const decoded = jwt.decode(token);

  // Reading `exp` back avoids duplicating jsonwebtoken's duration parsing.
  const exp =
    typeof decoded === 'object' && decoded !== null && typeof decoded.exp === 'number'
      ? decoded.exp
      : Math.floor(Date.now() / 1000);

  return {
    token,
    expiresAt: new Date(exp * 1000),
    expiresInSeconds: Math.max(0, exp - Math.floor(Date.now() / 1000)),
  };
}

function isAccessPayload(value: object): value is jwt.JwtPayload & AccessTokenPayload {
  const candidate = value as Partial<AccessTokenPayload>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.businessId === 'string' &&
    typeof candidate.email === 'string' &&
    (candidate.role === 'customer' || candidate.role === 'staff' || candidate.role === 'admin')
  );
}

function isRefreshPayload(value: object): value is jwt.JwtPayload & RefreshTokenPayload {
  const candidate = value as Partial<RefreshTokenPayload>;
  return typeof candidate.sub === 'string' && typeof candidate.jti === 'string';
}
