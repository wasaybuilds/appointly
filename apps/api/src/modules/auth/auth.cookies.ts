import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';

export const ACCESS_TOKEN_COOKIE = 'appointly_access_token';
export const REFRESH_TOKEN_COOKIE = 'appointly_refresh_token';

/** Path scoping means the refresh token is only ever sent to the endpoints that need it. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    ...(env.cookie.domain ? { domain: env.cookie.domain } : {}),
  };
}

/** Writes both session cookies httpOnly so XSS cannot read them; SameSite plus CORS covers CSRF. */
export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; refreshTokenExpiresAt: Date },
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    path: '/',
    // Session-scoped on purpose: the signed `exp` claim is what enforces expiry.
  });

  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshTokenExpiresAt,
  });
}

/** Clears both session cookies; attributes must match the originals or the browser keeps them. */
export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseOptions(), path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseOptions(), path: REFRESH_COOKIE_PATH });
}
