import type { Hono } from 'hono';
import {
  gitCheckoutBody,
  gitCommitBody,
  gitCreateBranchBody,
  gitStageBody,
} from './workspace.body.ts';
import type { WorkspaceControllerDeps } from './workspace.controller.ts';

export function registerGitRoutes(app: Hono, deps: WorkspaceControllerDeps): void {
  app.get('/api/workspaces/:id/git/status', async (c) => {
    return c.json(await deps.getGitStatus.execute({ workspaceId: c.req.param('id') }));
  });

  app.post('/api/workspaces/:id/git/init', async (c) => {
    return c.json(await deps.initGit.execute({ workspaceId: c.req.param('id') }), 201);
  });

  app.get('/api/workspaces/:id/git/file-status', async (c) => {
    const subPath = c.req.query('path') ?? '';
    return c.json(
      await deps.getGitFileStatus.execute({
        workspaceId: c.req.param('id'),
        subPath,
      }),
    );
  });

  app.get('/api/workspaces/:id/git/diff', async (c) => {
    const filePath = c.req.query('path') ?? '';
    return c.json(
      await deps.getGitDiff.execute({
        workspaceId: c.req.param('id'),
        path: filePath,
      }),
    );
  });

  app.post('/api/workspaces/:id/git/checkout', async (c) => {
    const body = gitCheckoutBody.parse(await c.req.json());
    return c.json(
      await deps.checkoutGitBranch.execute({
        workspaceId: c.req.param('id'),
        branch: body.branch,
      }),
    );
  });

  app.post('/api/workspaces/:id/git/branches', async (c) => {
    const body = gitCreateBranchBody.parse(await c.req.json());
    return c.json(
      await deps.createGitBranch.execute({
        workspaceId: c.req.param('id'),
        name: body.name,
        checkout: body.checkout,
        from: body.from,
      }),
      201,
    );
  });

  app.post('/api/workspaces/:id/git/add', async (c) => {
    const body = gitStageBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await deps.stageGit.execute({
        workspaceId: c.req.param('id'),
        paths: body.paths,
      }),
    );
  });

  app.post('/api/workspaces/:id/git/commit', async (c) => {
    const body = gitCommitBody.parse(await c.req.json());
    return c.json(
      await deps.commitGit.execute({
        workspaceId: c.req.param('id'),
        message: body.message,
      }),
    );
  });

  app.post('/api/workspaces/:id/git/push', async (c) => {
    return c.json(await deps.pushGit.execute({ workspaceId: c.req.param('id') }));
  });

  app.post('/api/workspaces/:id/git/pull', async (c) => {
    return c.json(await deps.pullGit.execute({ workspaceId: c.req.param('id') }));
  });
}
