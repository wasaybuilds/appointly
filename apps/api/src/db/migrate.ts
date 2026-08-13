import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './pool';
import { createLogger } from '../lib/logger/logger';

// Forward-only runner: `.sql` files in filename order, each in its own transaction so a
// failure leaves the schema untouched rather than half-applied.

const log = createLogger('db.migrate');

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text        PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`;

interface MigrationRow {
  filename: string;
}

async function runMigrations(): Promise<void> {
  await pool.query(CREATE_MIGRATIONS_TABLE);

  const applied = await pool.query<MigrationRow>('SELECT filename FROM schema_migrations');
  const alreadyApplied = new Set(applied.rows.map((row) => row.filename));

  const entries = await readdir(MIGRATIONS_DIR);
  const migrations = entries.filter((name) => name.endsWith('.sql')).sort();

  const pending = migrations.filter((name) => !alreadyApplied.has(name));

  if (pending.length === 0) {
    log.info({ applied: alreadyApplied.size }, 'Database is up to date, no migrations to apply');
    return;
  }

  for (const filename of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      log.info({ filename }, 'Migration applied');
    } catch (error) {
      await client.query('ROLLBACK');
      log.error({ err: error, filename }, 'Migration failed, rolled back');
      throw error;
    } finally {
      client.release();
    }
  }

  log.info({ count: pending.length }, 'Migrations complete');
}

try {
  await runMigrations();
} catch (error) {
  // Exit non-zero so CI and `setup` stop rather than continuing against a partial schema.
  log.error({ err: error }, 'Migration run aborted');
  await closePool();
  process.exit(1);
}

await closePool();
