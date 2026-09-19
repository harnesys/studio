import type { Hono } from 'hono';
export class HealthController {
  register(app: Hono): void {
    app.get('/health', (c) => c.json({ ok: true }));
  }
}
