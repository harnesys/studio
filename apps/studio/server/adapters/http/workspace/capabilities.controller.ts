import type { Hono } from 'hono';
import type { ListWorkspaceCapabilitiesInput } from '../../../application/workspaces/list-workspace-capabilities.use-case.ts';

export type CapabilitiesControllerDeps = {
  listWorkspaceCapabilities: ListWorkspaceCapabilitiesInput;
};

export class CapabilitiesController {
  constructor(private readonly deps: CapabilitiesControllerDeps) {}

  register(app: Hono): void {
    app.get('/api/workspaces/:id/capabilities', async (c) => {
      return c.json(
        await this.deps.listWorkspaceCapabilities.execute({ workspaceId: c.req.param('id') }),
      );
    });
  }
}
