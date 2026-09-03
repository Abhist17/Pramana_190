export type ApiError = { error: string; message?: string; ruleId?: string; reason?: string; basis?: string; policyVersion?: number; policyHash?: string };

let token: string | null = localStorage.getItem('pramana.token');

export function setToken(next: string | null) {
  token = next;
  if (next) localStorage.setItem('pramana.token', next);
  else localStorage.removeItem('pramana.token');
}
export const getToken = () => token;

export class RequestFailed extends Error {
  constructor(public status: number, public payload: ApiError) {
    super(payload.message ?? payload.reason ?? payload.error ?? `Request failed (${status})`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`/api${path}`, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new RequestFailed(response.status, { error: 'request_failed' });
    return (await response.blob()) as unknown as T;
  }
  const payload = await response.json();
  if (!response.ok) throw new RequestFailed(response.status, payload as ApiError);
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  blob: (path: string) => request<Blob>(path),
};

/** A 403 from the policy engine is information, not just a failure. */
export function isDenial(error: unknown): error is RequestFailed {
  return error instanceof RequestFailed && error.status === 403;
}
