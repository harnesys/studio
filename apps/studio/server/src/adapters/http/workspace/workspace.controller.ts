import type { Hono } from 'hono';
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
import type { RestartMcpServerInput } from '../../../application/workspaces/restart-mcp-server.use-case.ts';
import type { RevealWorkspaceInput } from '../../../application/workspaces/reveal-workspace.use-case.ts';
import type { SetMcpServerStateInput } from '../../../application/workspaces/set-mcp-server-state.use-case.ts';
import type { StageGitInput } from '../../../application/workspaces/stage-git.use-case.ts';
import type { UpdateWorkspaceInput } from '../../../application/workspaces/update-workspace.use-case.ts';
import type { UpsertWorkspaceMcpServerInput } from '../../../application/workspaces/upsert-workspace-mcp-server.use-case.ts';
import type { WriteWorkspaceFileContentInput } from '../../../application/workspaces/write-workspace-file-content.use-case.ts';
import type { DeskEventsPort } from '../../../domain/desk-events.port.ts';
import type { FilesWatcherPort } from '../../../domain/files-watcher.port.ts';
import { createWorkspaceBody, updateWorkspaceBody } from './workspace.body.ts';
import { registerFileRoutes } from './workspace-file-routes.ts';
import { registerGitRoutes } from './workspace-git-routes.ts';

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
  setMcpServerState: SetMcpServerStateInput;
  restartMcpServer: RestartMcpServerInput;
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

    registerGitRoutes(app, this.deps);
    registerFileRoutes(app, this.deps);
  }
}
