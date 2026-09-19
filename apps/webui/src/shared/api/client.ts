import type { StudioErrorBody } from '@harnesys/studio-shared';
import { getHostCredential } from './host-credential';
import { resolveApiTarget, setHostOnlineStatus } from './host-router';
export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
export type ApiJsonOptions = RequestInit & {
  nodeId?: string;
  hostId?: string;
};
export async function apiJson<T>(path: string, init?: ApiJsonOptions): Promise<T> {
  const { nodeId, hostId, ...requestInit } = init ?? {};
  const headers = new Headers(requestInit.headers);
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const target = resolveApiTarget(path, { nodeId, hostId });
  const credential = target.credential ?? getHostCredential();
  if (credential && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${credential}`);
  }
  let response: Response;
  try {
    response = await fetch(target.url, { ...requestInit, headers });
    setHostOnlineStatus(target.hostId, 'online');
  } catch (error) {
    setHostOnlineStatus(target.hostId, 'offline');
    throw error;
  }
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
    } catch {}
    throw new ApiError(response.status, message, body);
  }
  return (await response.json()) as T;
}
