/**
 * Typed fetch wrapper.
 * - credentials: 'include' (HttpOnly SameSite=Lax session cookie + double-submit CSRF cookie)
 * - CSRF double-submit token lazily fetched & cached; auto-retried once ONLY on CSRF_INVALID
 * - Distinguishes network failures (status 0 / "Server unreachable") vs HTTP error responses
 * - Attaches correlationId from JSON body or X-Correlation-Id header; never leaks stack traces
 */
export type ApiErrorKind = 'network' | 'http';

export class ApiError extends Error {
  status: number;
  correlationId?: string;
  code?: string;
  payload?: Record<string, unknown>;
  kind: ApiErrorKind;
  issues?: Array<{ path: string; message: string }>;

  constructor(
    status: number,
    message: string,
    correlationId?: string,
    code?: string,
    payload?: Record<string, unknown>,
    kind?: ApiErrorKind,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.correlationId = correlationId;
    this.code = code;
    this.payload = payload;
    this.kind = kind ?? (status === 0 ? 'network' : 'http');
    this.issues = Array.isArray(payload?.issues)
      ? (payload.issues as Array<{ path: string; message: string }>)
      : undefined;
  }

  get isNetworkError(): boolean {
    return this.kind === 'network';
  }
}

export function formatApiErrorDetail(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  if (err.kind === 'network') {
    return 'Network error — could not reach the backend server.';
  }
  const parts = [`HTTP ${err.status}`];
  if (err.correlationId) {
    parts.push(`Ref: ${err.correlationId}`);
  }
  return parts.join(' · ');
}

const CSRF_COOKIE = 'ss_csrf';

/** Read the current ss_csrf cookie (exposed as httpOnly=false for double-submit). */
function cookieToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + CSRF_COOKIE + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfToken: string | null = null;
let csrfInflight: Promise<string> | null = null;

export function resetCsrfCache(): void {
  csrfToken = null;
}

function statusFallbackMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request data';
    case 401:
      return 'Invalid credentials';
    case 403:
      return 'Access denied';
    case 404:
      return 'Endpoint not found';
    case 409:
      return 'Conflict with current state';
    case 423:
      return 'Account locked, try again later';
    case 429:
      return 'Too many attempts';
    case 501:
      return 'Feature is not configured on this server';
    case 502:
    case 503:
    case 504:
      return 'Server unreachable';
    default:
      return `HTTP ${status} error`;
  }
}

async function refreshCsrf(forceRotate = false): Promise<string> {
  if (csrfInflight) return csrfInflight;
  csrfInflight = (async () => {
    if (!forceRotate) {
      const existing = cookieToken();
      if (existing && existing.length >= 32) {
        csrfToken = existing;
        return existing;
      }
      if (csrfToken) return csrfToken;
    }

    let res: Response;
    try {
      res = await fetch(forceRotate ? '/api/auth/csrf?rotate=1' : '/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ApiError(0, 'Server unreachable', undefined, 'SERVER_UNREACHABLE', undefined, 'network');
    }

    const headerCorrelationId = res.headers.get('X-Correlation-Id') ?? undefined;
    const data = (await res.json().catch(() => ({}))) as {
      csrfToken?: string;
      error?: string;
      code?: string;
      correlationId?: string;
    };
    const correlationId = data.correlationId ?? headerCorrelationId;

    if (!res.ok) {
      if (data.code === 'SERVER_UNREACHABLE' || (!correlationId && res.status >= 500)) {
        throw new ApiError(0, 'Server unreachable', undefined, 'SERVER_UNREACHABLE', undefined, 'network');
      }
      throw new ApiError(
        res.status,
        typeof data.error === 'string' && data.error ? data.error : statusFallbackMessage(res.status),
        correlationId,
        data.code,
        data as Record<string, unknown>,
        'http',
      );
    }

    if (!data.csrfToken) {
      throw new ApiError(0, 'Server unreachable', undefined, 'SERVER_UNREACHABLE', undefined, 'network');
    }

    csrfToken = data.csrfToken;
    return csrfToken;
  })().finally(() => {
    csrfInflight = null;
  });
  return csrfInflight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}, attempt = 0): Promise<T> {
  const method = options.method ?? 'GET';
  const mutating = method !== 'GET';
  const token = mutating ? await refreshCsrf(false) : null;
  const headerToken = token ? (cookieToken() ?? token) : null;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headerToken ? { 'x-csrf-token': headerToken } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Server unreachable', undefined, 'SERVER_UNREACHABLE', undefined, 'network');
  }

  if (res.status === 204) return undefined as T;

  const headerCorrelationId = res.headers.get('X-Correlation-Id') ?? undefined;
  const rawText = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      data = {};
    }
  }

  const code = typeof data.code === 'string' ? data.code : undefined;
  const correlationId =
    typeof data.correlationId === 'string' ? data.correlationId : headerCorrelationId;

  // Retry once ONLY when the CSRF token was rejected or rotated
  if (
    mutating &&
    res.status === 403 &&
    attempt === 0 &&
    (code === 'CSRF_INVALID' || data.error === 'Invalid CSRF token')
  ) {
    csrfToken = null;
    await refreshCsrf(true);
    return apiFetch<T>(path, options, 1);
  }

  if (path === '/api/auth/logout' || (path === '/api/auth/account' && method === 'DELETE')) {
    csrfToken = null;
  }

  if (!res.ok) {
    // Detect Vite proxy failure / dead backend (no backend correlation header + empty/unreachable response)
    if (
      code === 'SERVER_UNREACHABLE' ||
      res.status === 502 ||
      res.status === 504 ||
      (res.status >= 500 && !correlationId && Object.keys(data).length === 0)
    ) {
      throw new ApiError(0, 'Server unreachable', undefined, 'SERVER_UNREACHABLE', undefined, 'network');
    }

    // Detect non-JSON Spring CORS rejection ("Invalid CORS request")
    if (res.status === 403 && !correlationId && rawText.includes('Invalid CORS request')) {
      throw new ApiError(
        0,
        'CORS request blocked by server configuration',
        undefined,
        'CORS_BLOCKED',
        undefined,
        'network',
      );
    }

    let message =
      typeof data.error === 'string' && data.error.trim().length > 0
        ? data.error
        : statusFallbackMessage(res.status);

    const issues = Array.isArray(data.issues)
      ? (data.issues as Array<{ path: string; message: string }>)
      : undefined;
    if (res.status === 400 && message === 'Invalid request data' && issues && issues.length > 0) {
      const first = issues[0];
      if (first?.message) {
        message = first.path ? `${first.path}: ${first.message}` : first.message;
      }
    }

    throw new ApiError(res.status, message, correlationId, code, data, 'http');
  }

  return data as T;
}

export const api = {
  get: <T>(p: string) => apiFetch<T>(p),
  post: <T>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'POST', body }),
  patch: <T>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'PATCH', body }),
  put: <T>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'PUT', body }),
  del: <T>(p: string, body?: unknown) => apiFetch<T>(p, { method: 'DELETE', body }),
};
