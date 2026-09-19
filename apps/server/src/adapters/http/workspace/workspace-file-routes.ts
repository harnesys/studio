import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { SSE_KEEP_ALIVE_MS } from '../../../config/constants.ts';
import {
  createWorkspaceFileBody,
  createWorkspaceSkillBody,
  deleteWorkspaceFileBody,
  moveWorkspaceFilesBody,
  setMcpServerStateBody,
  upsertWorkspaceMcpServerBody,
  writeWorkspaceFileContentBody,
} from './workspace.body.ts';
import type { WorkspaceControllerDeps } from './workspace.controller.ts';

export function registerFileRoutes(app: Hono, deps: WorkspaceControllerDeps): void {
  app.get('/api/workspaces/:id/skills', async (c) => {
    return c.json(await deps.listWorkspaceSkills.execute({ workspaceId: c.req.param('id') }));
  });

  app.post('/api/workspaces/:id/skills/reload', async (c) => {
    return c.json(await deps.reloadWorkspaceSkills.execute({ workspaceId: c.req.param('id') }));
  });

  app.post('/api/workspaces/:id/skills', async (c) => {
    const body = createWorkspaceSkillBody.parse(await c.req.json());
    const result = await deps.createWorkspaceSkill.execute({
      workspaceId: c.req.param('id'),
      name: body.name,
      description: body.description,
      ...(body.whenToUse !== undefined ? { whenToUse: body.whenToUse } : {}),
      instructions: body.instructions,
    });
    return c.json(result, 201);
  });

  app.get('/api/workspaces/:id/mcp', async (c) => {
    return c.json(await deps.getWorkspaceMcp.execute({ workspaceId: c.req.param('id') }));
  });

  app.get('/api/workspaces/:id/mcp/config', async (c) => {
    return c.json(await deps.getWorkspaceMcpConfig.execute({ workspaceId: c.req.param('id') }));
  });

  app.post('/api/workspaces/:id/mcp/reload', async (c) => {
    return c.json(await deps.reloadWorkspaceMcp.execute({ workspaceId: c.req.param('id') }));
  });

  app.put('/api/workspaces/:id/mcp/servers/:serverId', async (c) => {
    const body = upsertWorkspaceMcpServerBody.parse(await c.req.json());
    const result = await deps.upsertWorkspaceMcpServer.execute({
      workspaceId: c.req.param('id'),
      serverId: c.req.param('serverId'),
      transport: body.transport,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.command !== undefined ? { command: body.command } : {}),
      ...(body.args !== undefined ? { args: body.args } : {}),
      ...(body.env !== undefined ? { env: body.env } : {}),
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.headers !== undefined ? { headers: body.headers } : {}),
    });
    return c.json(result);
  });

  app.delete('/api/workspaces/:id/mcp/servers/:serverId', async (c) => {
    await deps.deleteWorkspaceMcpServer.execute({
      workspaceId: c.req.param('id'),
      serverId: c.req.param('serverId'),
    });
    return c.body(null, 204);
  });

  app.put('/api/workspaces/:id/mcp/servers/:serverId/state', async (c) => {
    const body = setMcpServerStateBody.parse(await c.req.json());
    return c.json(
      await deps.setMcpServerState.execute({
        workspaceId: c.req.param('id'),
        serverId: c.req.param('serverId'),
        enabled: body.enabled,
      }),
    );
  });

  app.post('/api/workspaces/:id/mcp/servers/:serverId/restart', async (c) => {
    return c.json(
      await deps.restartMcpServer.execute({
        workspaceId: c.req.param('id'),
        serverId: c.req.param('serverId'),
      }),
    );
  });

  app.post('/api/workspaces/:id/reveal', async (c) => {
    await deps.revealWorkspace.execute({ id: c.req.param('id') });
    return c.body(null, 204);
  });

  app.get('/api/workspaces/:id/files/tree', async (c) => {
    const hidden = c.req.query('hidden');
    const { entries } = await deps.listWorkspaceFileTree.execute({
      workspaceId: c.req.param('id'),
      ...(hidden === '1' || hidden === 'true' ? { includeHidden: true } : {}),
    });
    return c.json(entries);
  });

  app.get('/api/workspaces/:id/files', async (c) => {
    const subPath = c.req.query('path') ?? '';
    const { entries } = await deps.listWorkspaceFiles.execute({
      workspaceId: c.req.param('id'),
      subPath,
    });
    return c.json(entries);
  });

  app.post('/api/workspaces/:id/files', async (c) => {
    const body = createWorkspaceFileBody.parse(await c.req.json());
    const result = await deps.createWorkspaceFile.execute({
      workspaceId: c.req.param('id'),
      path: body.path,
      kind: body.kind,
    });
    return c.json(result, 201);
  });

  app.delete('/api/workspaces/:id/files', async (c) => {
    const body = deleteWorkspaceFileBody.parse(await c.req.json());
    await deps.deleteWorkspaceFile.execute({
      workspaceId: c.req.param('id'),
      path: body.path,
    });
    return c.body(null, 204);
  });

  app.post('/api/workspaces/:id/files/move', async (c) => {
    const body = moveWorkspaceFilesBody.parse(await c.req.json());
    const result = await deps.moveWorkspaceFiles.execute({
      workspaceId: c.req.param('id'),
      items: body.items,
    });
    return c.json(result);
  });

  app.get('/api/workspaces/:id/files/content', async (c) => {
    const path = c.req.query('path') ?? '';
    const result = await deps.getWorkspaceFileContent.execute({
      workspaceId: c.req.param('id'),
      path,
    });
    return new Response(result.bytes, {
      headers: {
        'Content-Type': result.mimeType,
        'Cache-Control': 'no-store',
      },
    });
  });

  app.put('/api/workspaces/:id/files/content', async (c) => {
    const body = writeWorkspaceFileContentBody.parse(await c.req.json());
    const result = await deps.writeWorkspaceFileContent.execute({
      workspaceId: c.req.param('id'),
      path: body.path,
      content: body.content,
    });
    return c.json(result);
  });

  app.get('/api/workspaces/:id/files/watch', async (c) => {
    const wsId = c.req.param('id');
    const workspaces = await deps.listWorkspaces.execute();
    const ws = workspaces.find((w) => w.id === wsId);
    if (!ws) {
      return c.body(null, 404);
    }

    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('X-Accel-Buffering', 'no');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
      const keepAlive = setInterval(() => {
        void stream.write(':\n\n').catch(() => {});
      }, 15_000);

      const unwatch = deps.filesWatcher.watch(wsId, ws.path, (event) => {
        void stream
          .writeSSE({
            event: 'fs-change',
            data: JSON.stringify(event),
          })
          .catch(() => {});
      });

      stream.onAbort(() => {
        clearInterval(keepAlive);
        unwatch();
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  });

  app.get('/api/desk/watch', (c) => {
    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('X-Accel-Buffering', 'no');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
      const keepAlive = setInterval(() => {
        void stream.write(':\n\n').catch(() => {});
      }, SSE_KEEP_ALIVE_MS);

      const unsubscribe = deps.deskEvents.subscribeAll((event) => {
        void stream
          .writeSSE({
            event: 'desk',
            data: JSON.stringify(event),
          })
          .catch(() => {});
      });

      stream.onAbort(() => {
        clearInterval(keepAlive);
        unsubscribe();
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  });

  app.get('/api/workspaces/:id/desk/watch', async (c) => {
    const wsId = c.req.param('id');
    const workspaces = await deps.listWorkspaces.execute();
    const ws = workspaces.find((item) => item.id === wsId);
    if (!ws) {
      return c.body(null, 404);
    }

    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('X-Accel-Buffering', 'no');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
      const keepAlive = setInterval(() => {
        void stream.write(':\n\n').catch(() => {});
      }, SSE_KEEP_ALIVE_MS);

      const unsubscribe = deps.deskEvents.subscribe(wsId, (event) => {
        void stream
          .writeSSE({
            event: 'desk',
            data: JSON.stringify(event),
          })
          .catch(() => {});
      });

      stream.onAbort(() => {
        clearInterval(keepAlive);
        unsubscribe();
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  });
}
