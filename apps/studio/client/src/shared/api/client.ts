import type { StudioErrorBody } from '@harnesys/studio-shared';

export class ApiError extends Error {
  status: number;
  /** Parsed response body of the failed request (e.g. run-conflict 409 payloads). */
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let message = response.statusText || 'Request failed';
    let body: unknown;
    try {
      body = await response.json();
      const error = (body as StudioErrorBody).error;
      if (error) {
        message = error;
      }
    } catch {
      // keep status text
    }
    throw new ApiError(response.status, message, body);
  }

  return (await response.json()) as T;
}
