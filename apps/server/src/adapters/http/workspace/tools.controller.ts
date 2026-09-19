import type { Hono } from 'hono';
import type { ListWorkspaceToolsInput } from '../../../application/workspaces/list-workspace-tools.use-case.ts';

export type ToolsControllerDeps = {
  listWorkspaceTools: ListWorkspaceToolsInput;
};

export class ToolsController {
  constructor(private readonly deps: ToolsControllerDeps) {}

  register(app: Hono): void {
    app.get('/api/workspaces/:id/tools', async (c) => {
      return c.json(await this.deps.listWorkspaceTools.execute({ workspaceId: c.req.param('id') }));
    });
  }
}
