/** SQLSTATE codes used by the schema's constraints; matching text instead would break on locale. */
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  EXCLUSION_VIOLATION: '23P01',
} as const;

interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const candidate = error as PostgresError;
  return typeof candidate.code === 'string' ? candidate : null;
}

/** True when a unique index rejected the write. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);

  if (pgError?.code !== PG_ERROR_CODES.UNIQUE_VIOLATION) {
    return false;
  }

  return constraint ? pgError.constraint === constraint : true;
}

/** True when a GiST exclusion constraint rejected the write — how a lost-race double booking surfaces. */
export function isExclusionViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);

  if (pgError?.code !== PG_ERROR_CODES.EXCLUSION_VIOLATION) {
    return false;
  }

  return constraint ? pgError.constraint === constraint : true;
}

/** True when a foreign key pointed at a row that does not exist. */
export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);

  if (pgError?.code !== PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return false;
  }

  return constraint ? pgError.constraint === constraint : true;
}
