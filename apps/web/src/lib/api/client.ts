import { API_ERROR_CODES, type ApiResponse, type PaginationMeta } from '@appointly/shared';
import { ApiError } from './api-error';

/*
  Sends httpOnly session cookies (so no token is ever handled in JavaScript),
  unwraps the `{ success, data, meta }` envelope, and silently rotates an
  expired access token once before retrying.
*/

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const API_PREFIX = '/api/v1';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Internal: prevents a refreshed request from recursing. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  meta: PaginationMeta;
}

/** Shared so five queries expiring together produce one refresh, not five. */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so simultaneous callers all observe the same
      // result before a new attempt can begin.
      queueMicrotask(() => {
        refreshPromise = null;
      });
    }
  })();

  return refreshPromise;
}

async function parseBody<TData>(response: Response): Promise<ApiResponse<TData> | null> {
  // 204 and proxy-generated HTML error pages both fail JSON parsing; neither
  // should surface as a confusing SyntaxError.
  try {
    return (await response.json()) as ApiResponse<TData>;
  } catch {
    return null;
  }
}

/** Performs a request against `/api/v1` and returns the unwrapped payload, throwing {@link ApiError} on failure. */
export async function apiRequest<TData>(
  path: string,
  options: RequestOptions = {},
): Promise<TData> {
  const { method = 'GET', body, skipRefresh = false, signal } = options;

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  const payload = await parseBody<TData>(response);

  if (response.ok && payload?.success) {
    return payload.data;
  }

  const code = payload?.success === false ? payload.error.code : API_ERROR_CODES.INTERNAL_ERROR;

  // Only an *expired* token is worth retrying. A missing or revoked session
  // means the user genuinely has to sign in again, and retrying would just
  // double every request on the way to the same 401.
  if (response.status === 401 && code === API_ERROR_CODES.AUTH_TOKEN_EXPIRED && !skipRefresh) {
    const refreshed = await refreshSession();

    if (refreshed) {
      return apiRequest<TData>(path, { ...options, skipRefresh: true });
    }
  }

  throw new ApiError(
    payload?.success === false ? payload.error.message : `Request failed (${response.status})`,
    code,
    response.status,
    payload?.success === false ? payload.error.issues : undefined,
    payload?.success === false ? payload.error.requestId : undefined,
  );
}

/** As {@link apiRequest}, but keeps the `meta` block that only paginated endpoints return. */
export async function apiRequestPaginated<TItem>(
  path: string,
  options: RequestOptions = {},
): Promise<PaginatedResult<TItem>> {
  const { method = 'GET', body, skipRefresh = false, signal } = options;

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    method,
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  const payload = await parseBody<TItem[]>(response);

  if (response.ok && payload?.success) {
    return {
      items: payload.data,
      meta: payload.meta ?? {
        page: 1,
        pageSize: payload.data.length,
        total: payload.data.length,
        totalPages: 1,
      },
    };
  }

  const code = payload?.success === false ? payload.error.code : API_ERROR_CODES.INTERNAL_ERROR;

  if (response.status === 401 && code === API_ERROR_CODES.AUTH_TOKEN_EXPIRED && !skipRefresh) {
    const refreshed = await refreshSession();

    if (refreshed) {
      return apiRequestPaginated<TItem>(path, { ...options, skipRefresh: true });
    }
  }

  throw new ApiError(
    payload?.success === false ? payload.error.message : `Request failed (${response.status})`,
    code,
    response.status,
    payload?.success === false ? payload.error.issues : undefined,
    payload?.success === false ? payload.error.requestId : undefined,
  );
}

/** Builds a query string, omitting empty values so URLs stay clean. */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  const queryString = search.toString();
  return queryString ? `?${queryString}` : '';
}
