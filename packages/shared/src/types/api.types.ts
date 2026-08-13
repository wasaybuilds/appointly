import type { PaginationMeta } from '../schemas/common.schema';

/* One envelope for every response, so the client has a single place to branch on success versus failure. */

export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  meta?: PaginationMeta;
}

export interface ApiFieldIssue {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    /** Stable, machine-readable identifier such as `AUTH_INVALID_CREDENTIALS`. */
    code: string;
    /** Safe to display to end users. */
    message: string;
    /** Present for 422 responses produced by request validation. */
    issues?: ApiFieldIssue[];
    /** Correlates a client-side failure with the server log entry. */
    requestId?: string;
  };
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

/** Shared with the client so it can react to specific failures, such as refreshing on `AUTH_TOKEN_EXPIRED`. */
export const API_ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_EMAIL_TAKEN: 'AUTH_EMAIL_TAKEN',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  APPOINTMENT_SLOT_TAKEN: 'APPOINTMENT_SLOT_TAKEN',
  APPOINTMENT_OUTSIDE_HOURS: 'APPOINTMENT_OUTSIDE_HOURS',
  APPOINTMENT_IN_PAST: 'APPOINTMENT_IN_PAST',
  APPOINTMENT_TOO_FAR_AHEAD: 'APPOINTMENT_TOO_FAR_AHEAD',
  APPOINTMENT_INVALID_TRANSITION: 'APPOINTMENT_INVALID_TRANSITION',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
