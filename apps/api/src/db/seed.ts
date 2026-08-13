import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './pool';
import { createLogger } from '../lib/logger/logger';

// Sample data lives in SQL, not TypeScript, so it can be reviewed or run through `psql` directly.

const log = createLogger('db.seed');

const SEED_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../db/seed.sql');

try {
  const sql = await readFile(SEED_FILE, 'utf8');
  await pool.query(sql);
  log.info('Seed data loaded');
} catch (error) {
  log.error({ err: error }, 'Seeding failed');
  await closePool();
  process.exit(1);
}

await closePool();
