import type { AuthUser } from '@appointly/shared';

/** `businessId` rides in the token and scopes every query, so tenant isolation is structural. */

export type UserRole = 'customer' | 'staff' | 'admin';

/** The verified identity attached to `req.auth`. */
export interface AuthenticatedActor {
  userId: string;
  businessId: string;
  email: string;
  role: UserRole;
}

/** Claims embedded in the signed access token. */
export interface AccessTokenPayload {
  sub: string;
  businessId: string;
  email: string;
  role: UserRole;
}

/** Claims embedded in the signed refresh token. */
export interface RefreshTokenPayload {
  sub: string;
  /** Identifies the stored `refresh_tokens` row, enabling rotation and revocation. */
  jti: string;
}

/** Row shape returned by the user repository. */
export interface UserRecord {
  id: string;
  businessId: string;
  businessName: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  createdAt: Date;
}

/** Result of a successful signup or login. */
export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresAt: Date;
}
