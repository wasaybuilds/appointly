import type { ApiErrorCode, ApiFieldIssue } from '@appointly/shared';

/** `string & {}` keeps autocomplete for known codes while still accepting one a newer API introduces. */
type ClientErrorCode = ApiErrorCode | (string & {});

/** A failed API call carrying the server's stable `code` to branch on and `requestId` to trace. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ClientErrorCode,
    readonly status: number,
    readonly issues?: ApiFieldIssue[],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the failure is field-level and should be shown on the form. */
  get isValidationError(): boolean {
    return this.status === 422 && Array.isArray(this.issues) && this.issues.length > 0;
  }

  /** Maps server field issues onto react-hook-form's error shape. */
  toFieldErrors(): Record<string, string> {
    const fields: Record<string, string> = {};

    for (const issue of this.issues ?? []) {
      // Server paths are dotted (`body.customerEmail`); the form knows only the leaf.
      const field = issue.path.split('.').pop() ?? issue.path;
      if (!fields[field]) {
        fields[field] = issue.message;
      }
    }

    return fields;
  }
}

/** Narrows an unknown caught value to an {@link ApiError}. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Extracts a displayable message; `fetch` network faults would otherwise reach the user as "Failed to fetch". */
export function toDisplayMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }

  if (error instanceof TypeError) {
    return 'Cannot reach the server. Check your connection and try again.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
