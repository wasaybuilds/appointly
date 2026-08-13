import type { PoolClient } from 'pg';
import { query } from '../../db/pool';
import type { UserRecord, UserRole } from './auth.types';

/** Column mapping is explicit, not generic, so a renamed column fails the build rather than runtime. */

interface UserRow {
  id: string;
  business_id: string;
  business_name: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  created_at: Date;
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at,
  };
}

const USER_SELECT = `
  SELECT u.id,
         u.business_id,
         b.name AS business_name,
         u.email,
         u.password_hash,
         u.full_name,
         u.phone,
         u.role,
         u.created_at
    FROM users u
    JOIN businesses b ON b.id = u.business_id
`;

export const authRepository = {
  /** Looks a user up by email; matches across tenants, as the prototype signs in with email alone. */
  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await query<UserRow>(`${USER_SELECT} WHERE u.email = $1 LIMIT 1`, [email]);
    const row = result.rows[0];
    return row ? toUserRecord(row) : null;
  },

  /** Loads a user by id, scoped to their tenant; a mismatch yields null. */
  async findById(userId: string, businessId: string): Promise<UserRecord | null> {
    const result = await query<UserRow>(
      `${USER_SELECT} WHERE u.id = $1 AND u.business_id = $2 LIMIT 1`,
      [userId, businessId],
    );
    const row = result.rows[0];
    return row ? toUserRecord(row) : null;
  },

  /** Inserts a user on the caller's transaction, since signup may create the tenant alongside it. */
  async insert(
    client: PoolClient,
    input: {
      businessId: string;
      email: string;
      passwordHash: string;
      fullName: string;
      phone: string | null;
      role: UserRole;
    },
  ): Promise<{ id: string; createdAt: Date }> {
    const result = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO users (business_id, email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [input.businessId, input.email, input.passwordHash, input.fullName, input.phone, input.role],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error('User insert returned no row');
    }

    return { id: row.id, createdAt: row.created_at };
  },

  /** Loads a user with no tenant filter — refresh only; request-scoped lookups must use `findById`. */
  async findByIdAcrossTenants(userId: string): Promise<UserRecord | null> {
    const result = await query<UserRow>(`${USER_SELECT} WHERE u.id = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    return row ? toUserRecord(row) : null;
  },

  /** Records a successful sign-in for basic account activity visibility. */
  async touchLastLogin(userId: string): Promise<void> {
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  },

  /** Resolves the tenant a signup joins; prototype puts everyone in the seeded demo business. */
  async findDefaultBusinessId(): Promise<string | null> {
    const result = await query<{ id: string }>(
      'SELECT id FROM businesses ORDER BY created_at ASC LIMIT 1',
    );
    return result.rows[0]?.id ?? null;
  },

  /** Creates a tenant; used only when the database has no business yet. */
  async insertBusiness(
    client: PoolClient,
    input: { name: string; slug: string; timezone: string; openHour: number; closeHour: number },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, timezone, open_hour, close_hour)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.name, input.slug, input.timezone, input.openHour, input.closeHour],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error('Business insert returned no row');
    }

    return row.id;
  },
};

export const refreshTokenRepository = {
  /** Persists the digest of an issued refresh token under the id shared with its `jti` claim. */
  async insert(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
  }): Promise<void> {
    await query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt, input.userAgent],
    );
  },

  /** Finds a live token row by id and digest, so a real `jti` with a forged token cannot match. */
  async findActive(
    id: string,
    tokenHash: string,
  ): Promise<{ id: string; userId: string } | null> {
    const result = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id
         FROM refresh_tokens
        WHERE id = $1
          AND token_hash = $2
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1`,
      [id, tokenHash],
    );

    const row = result.rows[0];
    return row ? { id: row.id, userId: row.user_id } : null;
  },

  /** Marks a token as rotated, linking it to its successor for auditability. */
  async revoke(id: string, replacedById: string | null): Promise<void> {
    await query(
      `UPDATE refresh_tokens
          SET revoked_at = now(), replaced_by_id = $2
        WHERE id = $1 AND revoked_at IS NULL`,
      [id, replacedById],
    );
  },

  /** Revokes every live session; also used on token replay, the classic signal that one leaked. */
  async revokeAllForUser(userId: string): Promise<void> {
    await query(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  },
};
