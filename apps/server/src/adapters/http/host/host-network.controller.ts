import type { Hono } from 'hono';
import { collectHostNetwork } from './network-info.ts';

export class HostNetworkController {
  register(app: Hono): void {
    app.get('/api/host/network', async (c) => {
      const info = await collectHostNetwork();
      return c.json(info);
    });
  }
}
