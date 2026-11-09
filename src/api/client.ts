/**
 * Tiny typed fetch wrapper.
 * - credentials same-origin (HttpOnly session cookie)
 * - CSRF double-submit token lazily fetched & cached; auto-retried once on 403
 * - Throws ApiError with status + optional correlationId; never leaks stack traces
 */
export class ApiError extends Error {
  status: number;
  correlationId?: string;
  code?: string;
  payload?: Record<string, unknown>;
  constructor(status: number, message: string, correlationId?: string, code?: string, payload?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.correlationId = correlationId;
    this.code = code;
    this.payload = payload;
  }
}

let csrfToken: string | null = null;

async function refreshCsrf(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const mutating = method !== 'GET';
  if (mutating && !csrfToken) await refreshCsrf();

  const doFetch = async (token: string | null) =>
    fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(csrfToken);
  if (mutating && res.status === 403) {
    // One silent retry with a fresh CSRF token.
    try {
      const fresh = await refreshCsrf();
      res = await doFetch(fresh);
    } catch {
      /* fall through to error handling */
    }
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof data.error === 'string' ? data.error : 'Request failed',
      typeof data.correlationId === 'string' ? data.correlationId : undefined,
      typeof data.code === 'string' ? data.code : undefined,
      data,
    );
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
