import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';
import { createLogger } from '../lib/logger/logger';

const log = createLogger('db.pool');

// `numeric` and `int8` arrive as strings to protect precision; ours are integer cents and COUNT(*) results.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));

pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number.parseInt(value, 10));

/** TLS on by default: managed providers (Aiven, Neon, RDS) refuse plaintext. Without `DATABASE_CA_CERT` the
 * self-signed chain is accepted — encrypted, but not authenticated against a MITM (see `docs/DECISIONS.md`). */
function resolveSslConfig(): pg.PoolConfig['ssl'] {
  if (!env.database.ssl) {
    return false;
  }

  if (env.database.caCert) {
    return { ca: env.database.caCert, rejectUnauthorized: true };
  }

  return { rejectUnauthorized: false };
}

/** Strips `sslmode` (`pg` maps it to `verify-full`, and has said that will change); TLS comes only from `ssl` above. */
function normaliseConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return url;
  }
}

export const pool = new pg.Pool({
  connectionString: normaliseConnectionString(env.database.url),
  max: env.database.poolMax,
  idleTimeoutMillis: 30_000,
  // A cloud database sits behind a network hop; the handshake needs more room than loopback.
  connectionTimeoutMillis: 15_000,
  ssl: resolveSslConfig(),
});

pool.on('error', (error) => {
  // Idle client dropped by the server: logged, not thrown, so one dead socket cannot kill the process.
  log.error({ err: error }, 'Unexpected error on idle PostgreSQL client');
});

const SLOW_QUERY_THRESHOLD_MS = 200;

/** Values are always bound, never interpolated, which makes SQL injection structurally impossible here. */
export async function query<TRow extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<TRow>> {
  const startedAt = performance.now();

  try {
    const result = await pool.query<TRow>(text, params as unknown[]);
    const durationMs = performance.now() - startedAt;

    if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
      log.warn(
        { durationMs: Math.round(durationMs), rowCount: result.rowCount, sql: collapse(text) },
        'Slow query',
      );
    }

    return result;
  } catch (error) {
    log.error({ err: error, sql: collapse(text) }, 'Query failed');
    throw error;
  }
}

/** Required for multi-statement writes: separate pooled queries leave the database inconsistent mid-failure. */
export async function withTransaction<TResult>(
  handler: (client: PoolClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      log.error({ err: rollbackError }, 'Rollback failed');
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Boot-time reachability check, so a bad connection string fails at startup, not on the first request. */
export async function assertDatabaseConnection(): Promise<void> {
  await query('SELECT 1');
  log.info('PostgreSQL connection established');
}

export async function closePool(): Promise<void> {
  await pool.end();
  log.info('PostgreSQL pool closed');
}

function collapse(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 300);
}
