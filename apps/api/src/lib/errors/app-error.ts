import { API_ERROR_CODES, type ApiErrorCode, type ApiFieldIssue } from '@appointly/shared';

/** `string & {}` allows an uncatalogued code while keeping autocomplete, which `| string` would lose. */
type ErrorCode = ApiErrorCode | (string & {});

/** The only error type the app throws; anything else reaching the handler is an unexpected 500. */
export interface AppError extends Error {
  readonly isAppError: true;
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly issues?: ApiFieldIssue[];
  /** Structured context for the log entry; never serialised to the client. */
  readonly context?: Record<string, unknown>;
}

export interface CreateAppErrorInput {
  statusCode: number;
  code: ErrorCode;
  /** Must be safe to display to an end user. */
  message: string;
  issues?: ApiFieldIssue[];
  context?: Record<string, unknown>;
  cause?: unknown;
}

/** Creates a domain error carrying everything the HTTP layer needs. */
export function createAppError(input: CreateAppErrorInput): AppError {
  const error = new Error(input.message, input.cause ? { cause: input.cause } : undefined) as Error &
    Record<string, unknown>;

  error.name = 'AppError';

  Object.defineProperties(error, {
    isAppError: { value: true, enumerable: false },
    statusCode: { value: input.statusCode, enumerable: true },
    code: { value: input.code, enumerable: true },
    issues: { value: input.issues, enumerable: true },
    context: { value: input.context, enumerable: true },
  });

  return error as unknown as AppError;
}

/** Type guard used by the error-handling middleware. */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { isAppError?: unknown }).isAppError === true
  );
}

/** Shorthand constructors so call sites read as domain statements, not error-prone status/code pairs. */
export const errors = {
  unauthorized: (message = 'You need to sign in to continue.'): AppError =>
    createAppError({ statusCode: 401, code: API_ERROR_CODES.UNAUTHORIZED, message }),

  tokenExpired: (message = 'Your session has expired. Please sign in again.'): AppError =>
    createAppError({ statusCode: 401, code: API_ERROR_CODES.AUTH_TOKEN_EXPIRED, message }),

  forbidden: (message = 'You do not have access to this resource.'): AppError =>
    createAppError({ statusCode: 403, code: API_ERROR_CODES.FORBIDDEN, message }),

  notFound: (resource = 'Resource'): AppError =>
    createAppError({
      statusCode: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: `${resource} was not found.`,
    }),

  validation: (issues: ApiFieldIssue[], message = 'Some fields need your attention.'): AppError =>
    createAppError({
      statusCode: 422,
      code: API_ERROR_CODES.VALIDATION_FAILED,
      message,
      issues,
    }),

  conflict: (code: ApiErrorCode, message: string, context?: Record<string, unknown>): AppError =>
    createAppError({ statusCode: 409, code, message, context }),

  internal: (message = 'Something went wrong on our side.', cause?: unknown): AppError =>
    createAppError({
      statusCode: 500,
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message,
      cause,
    }),
} as const;
