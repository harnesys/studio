import type { Hono } from 'hono';
import { version } from '../../../package.json';

export class MetaController {
  register(app: Hono): void {
    app.get('/api/meta', (c) => c.json({ version }));
  }
}
