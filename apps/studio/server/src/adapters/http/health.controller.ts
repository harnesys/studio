import type { Hono } from 'hono';

/** Liveness probe. No Bearer. */
export class HealthController {
  register(app: Hono): void {
    app.get('/health', (c) => c.json({ ok: true }));
  }
}
