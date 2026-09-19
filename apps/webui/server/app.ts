import { Hono } from 'hono';
import type { WebConfig } from './config.ts';
import { handleLogin, isAuthorized, loginPage, unauthorizedJson } from './gate.ts';
import { proxyRequest } from './proxy.ts';
import { createStaticHandler } from './static.ts';

/** Prefixes forwarded to the host: `/api` and `/ws` (WS upgrades are split off in the entry). */
export function isProxiedPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/ws' ||
    pathname.startsWith('/ws/')
  );
}

/**
 * HTTP surface behind the token gate, in match order:
 * /healthz (exempt) → POST /login (exempt) → gate → /api,/ws proxy → static files.
 */
export function createApp(config: WebConfig): Hono {
  const app = new Hono();
  const serveStatic = createStaticHandler(config.staticDir);

  app.get('/healthz', (c) => c.json({ ok: true }));

  app.post('/login', async (c) => handleLogin(c.req.raw, config.token));

  app.use('*', async (c, next) => {
    if (isAuthorized(c.req.raw, config.token)) {
      await next();
      return;
    }
    if (c.req.method === 'GET' || c.req.method === 'HEAD') {
      return loginPage();
    }
    return unauthorizedJson();
  });

  app.all('/api', (c) => proxyRequest(c.req.raw, config.upstream));
  app.all('/api/*', (c) => proxyRequest(c.req.raw, config.upstream));
  app.all('/ws', (c) => proxyRequest(c.req.raw, config.upstream));
  app.all('/ws/*', (c) => proxyRequest(c.req.raw, config.upstream));

  app.get('*', async (c) => serveStatic(new URL(c.req.url).pathname));

  return app;
}
