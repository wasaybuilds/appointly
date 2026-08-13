import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

/** `promisify` picks scrypt's three-argument overload, dropping the tuning options, so restate it. */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** OWASP-aligned parameters: N=2^16, r=8, p=1 (~64 MB per hash). */
const SCRYPT_COST = 2 ** 16;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISATION = 1;
const KEY_LENGTH_BYTES = 64;
const SALT_LENGTH_BYTES = 16;

/** scrypt refuses to run when maxmem is below roughly 128 * N * r bytes. */
const SCRYPT_MAX_MEMORY = 256 * SCRYPT_COST * SCRYPT_BLOCK_SIZE;

const ALGORITHM_PREFIX = 'scrypt';

/** Hashes a password into `scrypt$N$r$p$salt$key`; scrypt is memory-hard and needs no native addon. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH_BYTES);

  const derivedKey = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return [
    ALGORITHM_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISATION,
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

/** Verifies a password; parameters come from the stored hash so older hashes keep verifying. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');

  if (parts.length !== 6 || parts[0] !== ALGORITHM_PREFIX) {
    return false;
  }

  const cost = Number.parseInt(parts[1] ?? '', 10);
  const blockSize = Number.parseInt(parts[2] ?? '', 10);
  const parallelisation = Number.parseInt(parts[3] ?? '', 10);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expectedKey = Buffer.from(parts[5] ?? '', 'base64');

  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelisation)) {
    return false;
  }

  const derivedKey = await scrypt(password.normalize('NFKC'), salt, expectedKey.length, {
    N: cost,
    r: blockSize,
    p: parallelisation,
    maxmem: 256 * cost * blockSize,
  });

  // Length check first: timingSafeEqual throws on mismatched buffer lengths.
  if (derivedKey.length !== expectedKey.length) {
    return false;
  }

  // Constant-time: `===` would leak how much of the hash matched, enough to mount a timing attack.
  return timingSafeEqual(derivedKey, expectedKey);
}
