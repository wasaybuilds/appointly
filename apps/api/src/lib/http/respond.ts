import type { Response } from 'express';
import type { ApiSuccessResponse, PaginationMeta } from '@appointly/shared';

/** Sends a success response; the shared envelope is why controllers never call `res.json` directly. */
export function sendSuccess<TData>(res: Response, data: TData, statusCode = 200): void {
  const body: ApiSuccessResponse<TData> = { success: true, data };
  res.status(statusCode).json(body);
}

/** Sends a page of records alongside its pagination metadata. */
export function sendPaginated<TData>(
  res: Response,
  data: TData[],
  meta: PaginationMeta,
  statusCode = 200,
): void {
  const body: ApiSuccessResponse<TData[]> = { success: true, data, meta };
  res.status(statusCode).json(body);
}

/** Builds pagination metadata from a total row count and the requested 1-based page. */
export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
