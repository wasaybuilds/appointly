import { z } from 'zod';

/**
 * Primitive schemas reused across every module. Keeping them in one place means
 * validation messages stay consistent between the API and the web client, which
 * both compile against this package.
 */

export const uuidSchema = z.uuid('Must be a valid UUID');

export const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  error: 'Must be an ISO 8601 date-time string',
});

export const isoDateSchema = z.iso.date('Must be an ISO 8601 date (YYYY-MM-DD)');

/**
 * Cursor-less pagination. Offset pagination is adequate for per-user appointment
 * lists (small, bounded result sets); the tradeoff is documented in `docs/DATABASE.md`.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
