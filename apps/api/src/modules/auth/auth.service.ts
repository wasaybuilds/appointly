import {
  API_ERROR_CODES,
  type AuthUser,
  type LoginInput,
  type SignupInput,
} from '@appointly/shared';
import { withTransaction } from '../../db/pool';
import { createAppError, errors } from '../../lib/errors/app-error';
import { createLogger } from '../../lib/logger/logger';
import { isUniqueViolation } from '../../lib/db/pg-errors';
import { hashPassword, verifyPassword } from './password.service';
import { authRepository, refreshTokenRepository } from './auth.repository';
import {
  createRefreshTokenId,
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './token.service';
import type { AuthResult, UserRecord } from './auth.types';
import { env } from '../../config/env';

const log = createLogger('auth.service');

/** Compared against when no user matches, so a bad email costs the same time as a bad password. */
const TIMING_DECOY_HASH =
  'scrypt$65536$8$1$2w58NSQaVSPsSizUo4RELg==$EsePbOzC7gKBBAgchBr7AfDcHC54FTWF2vOtGXuBzZMMzqvfvi2dGFioXovuW+GhnHHC+oeJg1kQ2xkV5pTFbw==';

function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    businessId: user.businessId,
    businessName: user.businessName,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Issues an access/refresh pair and records the refresh token server-side. */
async function issueSession(user: UserRecord, userAgent: string | null): Promise<AuthResult> {
  const access = signAccessToken({
    sub: user.id,
    businessId: user.businessId,
    email: user.email,
    role: user.role,
  });

  const refreshTokenId = createRefreshTokenId();
  const refresh = signRefreshToken(user.id, refreshTokenId);

  await refreshTokenRepository.insert({
    id: refreshTokenId,
    userId: user.id,
    tokenHash: hashRefreshToken(refresh.token),
    expiresAt: refresh.expiresAt,
    userAgent,
  });

  return {
    user: toAuthUser(user),
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresInSeconds: access.expiresInSeconds,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export const authService = {
  /** Registers an account and signs in; joins the default tenant, creating one if none exists. */
  async signup(input: SignupInput, userAgent: string | null): Promise<AuthResult> {
    const existing = await authRepository.findByEmail(input.email);

    if (existing) {
      throw createAppError({
        statusCode: 409,
        code: API_ERROR_CODES.AUTH_EMAIL_TAKEN,
        message: 'An account with this email already exists. Try signing in instead.',
      });
    }

    const passwordHash = await hashPassword(input.password);
    const phone = input.phone && input.phone.length > 0 ? input.phone : null;

    let userId: string;

    try {
      userId = await withTransaction(async (client) => {
        let businessId = await authRepository.findDefaultBusinessId();

        if (!businessId) {
          businessId = await authRepository.insertBusiness(client, {
            name: 'Appointly Demo Clinic',
            slug: 'appointly-demo',
            timezone: env.business.timezone,
            openHour: env.business.openHour,
            closeHour: env.business.closeHour,
          });
        }

        const created = await authRepository.insert(client, {
          businessId,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          phone,
          role: 'customer',
        });

        return created.id;
      });
    } catch (error) {
      // Two concurrent signups both pass the check above; the unique constraint is the arbiter.
      if (isUniqueViolation(error)) {
        throw createAppError({
          statusCode: 409,
          code: API_ERROR_CODES.AUTH_EMAIL_TAKEN,
          message: 'An account with this email already exists. Try signing in instead.',
        });
      }
      throw error;
    }

    const user = await authRepository.findByEmail(input.email);

    if (!user || user.id !== userId) {
      throw errors.internal('Account was created but could not be loaded.');
    }

    log.info({ userId: user.id, businessId: user.businessId }, 'User registered');

    return issueSession(user, userAgent);
  },

  /** Starts a session; wrong email and wrong password are indistinguishable to a caller. */
  async login(input: LoginInput, userAgent: string | null): Promise<AuthResult> {
    const user = await authRepository.findByEmail(input.email);
    const passwordMatches = await verifyPassword(
      input.password,
      user?.passwordHash ?? TIMING_DECOY_HASH,
    );

    if (!user || !passwordMatches) {
      log.warn({ email: input.email }, 'Failed login attempt');
      throw createAppError({
        statusCode: 401,
        code: API_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        message: 'Email or password is incorrect.',
      });
    }

    await authRepository.touchLastLogin(user.id);
    log.info({ userId: user.id }, 'User signed in');

    return issueSession(user, userAgent);
  },

  /** Rotates a single-use refresh token; a replay means a copy leaked, so all sessions are killed. */
  async refresh(refreshToken: string, userAgent: string | null): Promise<AuthResult> {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await refreshTokenRepository.findActive(
      payload.jti,
      hashRefreshToken(refreshToken),
    );

    if (!stored) {
      log.warn({ userId: payload.sub, tokenId: payload.jti }, 'Refresh token reuse or revocation');
      await refreshTokenRepository.revokeAllForUser(payload.sub);
      throw errors.unauthorized('Your session has ended. Please sign in again.');
    }

    // Re-read the user: role, tenant or the account may have changed since the token was minted.
    const user = await authRepository.findByIdAcrossTenants(stored.userId);

    if (!user) {
      throw errors.unauthorized('Your account is no longer available.');
    }

    const session = await issueSession(user, userAgent);

    // Link old -> new so the rotation chain stays auditable.
    const rotatedToId = verifyRefreshToken(session.refreshToken).jti;
    await refreshTokenRepository.revoke(stored.id, rotatedToId);

    return session;
  },

  /** Ends the session; malformed tokens are ignored so a corrupted cookie can still be cleared. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      await refreshTokenRepository.revoke(payload.jti, null);
      log.info({ userId: payload.sub }, 'User signed out');
    } catch {
      // Nothing to revoke; the caller's cookies are cleared regardless.
    }
  },

  /** Reads the user from the database so role changes apply before the access token expires. */
  async getCurrentUser(userId: string, businessId: string): Promise<AuthUser> {
    const user = await authRepository.findById(userId, businessId);

    if (!user) {
      throw errors.unauthorized('Your account is no longer available.');
    }

    return toAuthUser(user);
  },
};
