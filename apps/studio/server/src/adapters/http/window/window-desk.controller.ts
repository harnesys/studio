import type { Hono } from 'hono';
import type { MachineConfigPort, WindowDesk } from '../../../domain/machine-config.ts';
import { windowDeskBody } from './window-desk.body.ts';

export type WindowDeskControllerDeps = {
  machineConfig: MachineConfigPort;
};

export class WindowDeskController {
  constructor(private readonly deps: WindowDeskControllerDeps) {}

  register(app: Hono): void {
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
  }
}
