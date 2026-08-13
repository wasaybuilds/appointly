import type { Request, Response } from 'express';
import type { AuthSessionResponse, LoginInput, SignupInput } from '@appointly/shared';
import { errors } from '../../lib/errors/app-error';
import { sendSuccess } from '../../lib/http/respond';
import { getValidated } from '../../middleware/validate.middleware';
import { requireActor } from '../../middleware/authenticate.middleware';
import { authService } from './auth.service';
import {
  REFRESH_TOKEN_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './auth.cookies';

/** HTTP adapter: tokens are written as cookies here and never returned in the response body. */

function readUserAgent(req: Request): string | null {
  return req.header('user-agent')?.slice(0, 255) ?? null;
}

export const authController = {
  /** `POST /api/v1/auth/signup` — create an account and start a session. */
  signup: async (req: Request, res: Response): Promise<void> => {
    const { body } = getValidated<SignupInput>(req);
    const result = await authService.signup(body, readUserAgent(req));

    setSessionCookies(res, result);

    const payload: AuthSessionResponse = {
      user: result.user,
      expiresIn: result.accessTokenExpiresInSeconds,
    };

    sendSuccess(res, payload, 201);
  },

  /** `POST /api/v1/auth/login` — exchange credentials for a session. */
  login: async (req: Request, res: Response): Promise<void> => {
    const { body } = getValidated<LoginInput>(req);
    const result = await authService.login(body, readUserAgent(req));

    setSessionCookies(res, result);

    const payload: AuthSessionResponse = {
      user: result.user,
      expiresIn: result.accessTokenExpiresInSeconds,
    };

    sendSuccess(res, payload);
  },

  /** `POST /api/v1/auth/refresh` — rotate the session using the path-scoped refresh cookie. */
  refresh: async (req: Request, res: Response): Promise<void> => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      throw errors.unauthorized('Your session has ended. Please sign in again.');
    }

    const result = await authService.refresh(refreshToken, readUserAgent(req));

    setSessionCookies(res, result);

    const payload: AuthSessionResponse = {
      user: result.user,
      expiresIn: result.accessTokenExpiresInSeconds,
    };

    sendSuccess(res, payload);
  },

  /** `POST /api/v1/auth/logout` — revoke the session and clear cookies. */
  logout: async (req: Request, res: Response): Promise<void> => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;

    await authService.logout(cookies?.[REFRESH_TOKEN_COOKIE]);
    clearSessionCookies(res);

    sendSuccess(res, { signedOut: true });
  },

  /** `GET /api/v1/auth/me` — the signed-in user's current profile. */
  me: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const user = await authService.getCurrentUser(actor.userId, actor.businessId);

    sendSuccess(res, user);
  },
};

