import type { Hono } from 'hono';
import type {
  MachineConfigPort,
  WindowDesk,
  WindowHostRecord,
} from '../../../domain/machine-config.ts';
import { isLoopbackPeer } from '../loopback.ts';
import { windowDeskBody, windowHostsBody } from './window-desk.body.ts';
export type WindowDeskControllerDeps = {
  machineConfig: MachineConfigPort;
};
export class WindowDeskController {
  constructor(private readonly deps: WindowDeskControllerDeps) {}
  register(app: Hono): void {
    app.get('/api/window/bootstrap', (c) => {
      if (!isLoopbackPeer(c)) {
        return c.json({ error: 'forbidden' }, 403);
      }
      const { hosts, desk } = this.deps.machineConfig.read().window;
      return c.json({ hosts, desk });
    });
    app.get('/api/window/desk', (c) => {
      return c.json(this.deps.machineConfig.read().window.desk);
    });
    app.put('/api/window/desk', async (c) => {
      const body = windowDeskBody.parse(await c.req.json());
      const desk: WindowDesk = {
        selectedNodeIds: body.selectedNodeIds,
        park: body.park,
      };
      const next = this.deps.machineConfig.writeWindow({ desk });
      return c.json(next.window.desk);
    });
    app.get('/api/window/hosts', (c) => {
      return c.json({ hosts: this.deps.machineConfig.read().window.hosts });
    });
    app.put('/api/window/hosts', async (c) => {
      const body = windowHostsBody.parse(await c.req.json());
      const hosts: WindowHostRecord[] = body.hosts.map((row) => ({
        id: row.id,
        name: row.name,
        baseUrl: row.baseUrl,
        credential: row.credential,
      }));
      const next = this.deps.machineConfig.writeWindow({ hosts });
      return c.json({ hosts: next.window.hosts });
    });
  }
}
