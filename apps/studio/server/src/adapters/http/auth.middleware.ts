import type { MiddlewareHandler } from 'hono';

/** Paths that skip Bearer (and query token) checks. */
export function isHostAuthExempt(method: string, path: string): boolean {
  if (method === 'GET' && path === '/health') {
    return true;
  }
  if (method === 'GET' && path === '/api/window/bootstrap') {
    return true;
  }
  if (method === 'POST' && path === '/api/host/pair/redeem') {
    return true;
  }
  if (method === 'POST' && /^\/api\/workspaces\/[^/]+\/hooks\/[^/]+$/.test(path)) {
    return true;
  }
  return false;
}

/**
 * Require `Authorization: Bearer <host.token>`, or `?token=` (WebSocket / EventSource).
 * Exempt: GET /health, GET /api/window/bootstrap, POST pair/redeem, POST webhook fire.
 */
export function requireHostToken(token: string): MiddlewareHandler {
  return async (c, next) => {
    if (isHostAuthExempt(c.req.method, c.req.path)) {
      await next();
      return;
    }
    const header = c.req.header('Authorization') ?? '';
    const expected = `Bearer ${token}`;
    const queryToken = c.req.query('token');
    if (header === expected || (typeof queryToken === 'string' && queryToken === token)) {
      await next();
      return;
    }
    return c.json({ error: 'unauthorized' }, 401);
  };
}
