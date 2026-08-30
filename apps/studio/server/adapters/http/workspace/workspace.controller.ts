import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { CheckoutGitBranchInput } from '../../../application/workspaces/checkout-git-branch.use-case.ts';
import type { CommitGitInput } from '../../../application/workspaces/commit-git.use-case.ts';
import type { CreateGitBranchInput } from '../../../application/workspaces/create-git-branch.use-case.ts';
import type { CreateWorkspaceInput } from '../../../application/workspaces/create-workspace.use-case.ts';
import type { CreateWorkspaceFileInput } from '../../../application/workspaces/create-workspace-file.use-case.ts';
import type { CreateWorkspaceSkillInput } from '../../../application/workspaces/create-workspace-skill.use-case.ts';
import type { DeleteWorkspaceInput } from '../../../application/workspaces/delete-workspace.use-case.ts';
import type { DeleteWorkspaceFileInput } from '../../../application/workspaces/delete-workspace-file.use-case.ts';
import type { DeleteWorkspaceMcpServerInput } from '../../../application/workspaces/delete-workspace-mcp-server.use-case.ts';
import type { GetGitDiffInput } from '../../../application/workspaces/get-git-diff.use-case.ts';
import type { GetGitFileStatusInput } from '../../../application/workspaces/get-git-file-status.use-case.ts';
import type { GetGitStatusInput } from '../../../application/workspaces/get-git-status.use-case.ts';
import type { GetWorkspaceFileContentInput } from '../../../application/workspaces/get-workspace-file-content.use-case.ts';
import type { GetWorkspaceMcpInput } from '../../../application/workspaces/get-workspace-mcp.use-case.ts';
import type { GetWorkspaceMcpConfigInput } from '../../../application/workspaces/get-workspace-mcp-config.use-case.ts';
import type { GetWorkspaceStatusInput } from '../../../application/workspaces/get-workspace-status.use-case.ts';
import type { ListWorkspaceFilesInput } from '../../../application/workspaces/list-workspace-files.use-case.ts';
import type { ListWorkspaceSkillsInput } from '../../../application/workspaces/list-workspace-skills.use-case.ts';
import type { ListWorkspacesInput } from '../../../application/workspaces/list-workspaces.use-case.ts';
import type { PickWorkspaceInput } from '../../../application/workspaces/pick-workspace.use-case.ts';
import type { PullGitInput } from '../../../application/workspaces/pull-git.use-case.ts';
import type { PushGitInput } from '../../../application/workspaces/push-git.use-case.ts';
import type { ReloadWorkspaceMcpInput } from '../../../application/workspaces/reload-workspace-mcp.use-case.ts';
import type { ReloadWorkspaceSkillsInput } from '../../../application/workspaces/reload-workspace-skills.use-case.ts';
import type { RevealWorkspaceInput } from '../../../application/workspaces/reveal-workspace.use-case.ts';
import type { StageGitInput } from '../../../application/workspaces/stage-git.use-case.ts';
import type { UpdateWorkspaceInput } from '../../../application/workspaces/update-workspace.use-case.ts';
import type { UpsertWorkspaceMcpServerInput } from '../../../application/workspaces/upsert-workspace-mcp-server.use-case.ts';
import type { WriteWorkspaceFileContentInput } from '../../../application/workspaces/write-workspace-file-content.use-case.ts';
import { SSE_KEEP_ALIVE_MS } from '../../../config/constants.ts';
import type { DeskEventsPort } from '../../../domain/desk-events.port.ts';
import type { FilesWatcherPort } from '../../../domain/files-watcher.port.ts';
import {
  createWorkspaceBody,
  createWorkspaceFileBody,
  createWorkspaceSkillBody,
  deleteWorkspaceFileBody,
  gitCheckoutBody,
  gitCommitBody,
  gitCreateBranchBody,
  gitStageBody,
  updateWorkspaceBody,
  upsertWorkspaceMcpServerBody,
  writeWorkspaceFileContentBody,
} from './workspace.body.ts';

export type WorkspaceControllerDeps = {
  listWorkspaces: ListWorkspacesInput;
  pickWorkspace: PickWorkspaceInput;
  createWorkspace: CreateWorkspaceInput;
  updateWorkspace: UpdateWorkspaceInput;
  deleteWorkspace: DeleteWorkspaceInput;
  getWorkspaceStatus: GetWorkspaceStatusInput;
  listWorkspaceSkills: ListWorkspaceSkillsInput;
  reloadWorkspaceSkills: ReloadWorkspaceSkillsInput;
  createWorkspaceSkill: CreateWorkspaceSkillInput;
  getWorkspaceMcp: GetWorkspaceMcpInput;
  getWorkspaceMcpConfig: GetWorkspaceMcpConfigInput;
  reloadWorkspaceMcp: ReloadWorkspaceMcpInput;
  upsertWorkspaceMcpServer: UpsertWorkspaceMcpServerInput;
  deleteWorkspaceMcpServer: DeleteWorkspaceMcpServerInput;
  revealWorkspace: RevealWorkspaceInput;
  listWorkspaceFiles: ListWorkspaceFilesInput;
  createWorkspaceFile: CreateWorkspaceFileInput;
  deleteWorkspaceFile: DeleteWorkspaceFileInput;
  getWorkspaceFileContent: GetWorkspaceFileContentInput;
  writeWorkspaceFileContent: WriteWorkspaceFileContentInput;
  getGitStatus: GetGitStatusInput;
  getGitFileStatus: GetGitFileStatusInput;
  getGitDiff: GetGitDiffInput;
  checkoutGitBranch: CheckoutGitBranchInput;
  createGitBranch: CreateGitBranchInput;
  stageGit: StageGitInput;
  commitGit: CommitGitInput;
  pushGit: PushGitInput;
  pullGit: PullGitInput;
  filesWatcher: FilesWatcherPort;
  deskEvents: DeskEventsPort;
};

export class WorkspaceController {
  constructor(private readonly deps: WorkspaceControllerDeps) {}

  register(app: Hono): void {
    app.get('/api/workspaces', async (c) => {
      return c.json(await this.deps.listWorkspaces.execute());
    });

    app.post('/api/workspaces/pick', async (c) => {
      const picked = await this.deps.pickWorkspace.execute();
      if (!picked) {
        return c.body(null, 204);
      }
      return c.json(picked);
    });

    app.post('/api/workspaces', async (c) => {
      const body = createWorkspaceBody.parse(await c.req.json());
      const { workspace } = await this.deps.createWorkspace.execute({
        ...(body.path ? { path: body.path } : {}),
        ...(body.name ? { name: body.name } : {}),
      });
      return c.json(workspace, 201);
    });

    app.patch('/api/workspaces/:id', async (c) => {
      const body = updateWorkspaceBody.parse(await c.req.json());
      const workspace = await this.deps.updateWorkspace.execute({
        id: c.req.param('id'),
        name: body.name ?? undefined,
        path: body.path ?? undefined,
      });
      return c.json(workspace);
    });

    app.delete('/api/workspaces/:id', async (c) => {
      await this.deps.deleteWorkspace.execute({ id: c.req.param('id') });
      return c.body(null, 204);
    });

    app.get('/api/workspaces/:id/status', async (c) => {
      return c.json(await this.deps.getWorkspaceStatus.execute({ id: c.req.param('id') }));
    });

    // Git
    app.get('/api/workspaces/:id/git/status', async (c) => {
      return c.json(await this.deps.getGitStatus.execute({ workspaceId: c.req.param('id') }));
    });

    app.get('/api/workspaces/:id/git/file-status', async (c) => {
      const subPath = c.req.query('path') ?? '';
      return c.json(
        await this.deps.getGitFileStatus.execute({
          workspaceId: c.req.param('id'),
          subPath,
        }),
      );
    });

    app.get('/api/workspaces/:id/git/diff', async (c) => {
      const filePath = c.req.query('path') ?? '';
      return c.json(
        await this.deps.getGitDiff.execute({
          workspaceId: c.req.param('id'),
          path: filePath,
        }),
      );
    });

    app.post('/api/workspaces/:id/git/checkout', async (c) => {
      const body = gitCheckoutBody.parse(await c.req.json());
      return c.json(
        await this.deps.checkoutGitBranch.execute({
          workspaceId: c.req.param('id'),
          branch: body.branch,
        }),
      );
    });

    app.post('/api/workspaces/:id/git/branches', async (c) => {
      const body = gitCreateBranchBody.parse(await c.req.json());
      return c.json(
        await this.deps.createGitBranch.execute({
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
        await this.deps.stageGit.execute({
          workspaceId: c.req.param('id'),
          paths: body.paths,
        }),
      );
    });

    app.post('/api/workspaces/:id/git/commit', async (c) => {
      const body = gitCommitBody.parse(await c.req.json());
      return c.json(
        await this.deps.commitGit.execute({
          workspaceId: c.req.param('id'),
          message: body.message,
        }),
      );
    });

    app.post('/api/workspaces/:id/git/push', async (c) => {
      return c.json(await this.deps.pushGit.execute({ workspaceId: c.req.param('id') }));
    });

    app.post('/api/workspaces/:id/git/pull', async (c) => {
      return c.json(await this.deps.pullGit.execute({ workspaceId: c.req.param('id') }));
    });

    app.get('/api/workspaces/:id/skills', async (c) => {
      return c.json(
        await this.deps.listWorkspaceSkills.execute({ workspaceId: c.req.param('id') }),
      );
    });

    app.post('/api/workspaces/:id/skills/reload', async (c) => {
      return c.json(
        await this.deps.reloadWorkspaceSkills.execute({ workspaceId: c.req.param('id') }),
      );
    });

    app.post('/api/workspaces/:id/skills', async (c) => {
      const body = createWorkspaceSkillBody.parse(await c.req.json());
      const result = await this.deps.createWorkspaceSkill.execute({
        workspaceId: c.req.param('id'),
        name: body.name,
        description: body.description,
        ...(body.whenToUse !== undefined ? { whenToUse: body.whenToUse } : {}),
        instructions: body.instructions,
      });
      return c.json(result, 201);
    });

    app.get('/api/workspaces/:id/mcp', async (c) => {
      return c.json(await this.deps.getWorkspaceMcp.execute({ workspaceId: c.req.param('id') }));
    });

    app.get('/api/workspaces/:id/mcp/config', async (c) => {
      return c.json(
        await this.deps.getWorkspaceMcpConfig.execute({ workspaceId: c.req.param('id') }),
      );
    });

    app.post('/api/workspaces/:id/mcp/reload', async (c) => {
      return c.json(await this.deps.reloadWorkspaceMcp.execute({ workspaceId: c.req.param('id') }));
    });

    app.put('/api/workspaces/:id/mcp/servers/:serverId', async (c) => {
      const body = upsertWorkspaceMcpServerBody.parse(await c.req.json());
      const result = await this.deps.upsertWorkspaceMcpServer.execute({
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
      await this.deps.deleteWorkspaceMcpServer.execute({
        workspaceId: c.req.param('id'),
        serverId: c.req.param('serverId'),
      });
      return c.body(null, 204);
    });

    app.post('/api/workspaces/:id/reveal', async (c) => {
      await this.deps.revealWorkspace.execute({ id: c.req.param('id') });
      return c.body(null, 204);
    });

    // Files
    app.get('/api/workspaces/:id/files', async (c) => {
      const subPath = c.req.query('path') ?? '';
      const { entries } = await this.deps.listWorkspaceFiles.execute({
        workspaceId: c.req.param('id'),
        subPath,
      });
      return c.json(entries);
    });

    app.post('/api/workspaces/:id/files', async (c) => {
      const body = createWorkspaceFileBody.parse(await c.req.json());
      const result = await this.deps.createWorkspaceFile.execute({
        workspaceId: c.req.param('id'),
        path: body.path,
        kind: body.kind,
      });
      return c.json(result, 201);
    });

    app.delete('/api/workspaces/:id/files', async (c) => {
      const body = deleteWorkspaceFileBody.parse(await c.req.json());
      await this.deps.deleteWorkspaceFile.execute({
        workspaceId: c.req.param('id'),
        path: body.path,
      });
      return c.body(null, 204);
    });

    app.get('/api/workspaces/:id/files/content', async (c) => {
      const path = c.req.query('path') ?? '';
      const result = await this.deps.getWorkspaceFileContent.execute({
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
      const result = await this.deps.writeWorkspaceFileContent.execute({
        workspaceId: c.req.param('id'),
        path: body.path,
        content: body.content,
      });
      return c.json(result);
    });

    // SSE: file system changes
    app.get('/api/workspaces/:id/files/watch', async (c) => {
      const wsId = c.req.param('id');
      const workspaces = await this.deps.listWorkspaces.execute();
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

        const unwatch = this.deps.filesWatcher.watch(wsId, ws.path, (event) => {
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

    app.get('/api/workspaces/:id/desk/watch', async (c) => {
      const wsId = c.req.param('id');
      const workspaces = await this.deps.listWorkspaces.execute();
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

        const unsubscribe = this.deps.deskEvents.subscribe(wsId, (event) => {
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
}
