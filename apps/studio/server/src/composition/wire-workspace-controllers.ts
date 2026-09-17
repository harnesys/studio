import type { Hono } from 'hono';
import type { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import type { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { TerminalController } from '../adapters/http/terminal/terminal.controller.ts';
import { CapabilitiesController } from '../adapters/http/workspace/capabilities.controller.ts';
import { ToolsController } from '../adapters/http/workspace/tools.controller.ts';
import { WorkspaceController } from '../adapters/http/workspace/workspace.controller.ts';
import type { SqlitePluginsAdapter } from '../adapters/store/sqlite/repos/sqlite-plugins.adapter.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import type { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import type { NodeRegistry } from '../application/nodes/node-registry.ts';
import { CheckoutGitBranchUseCase } from '../application/workspaces/checkout-git-branch.use-case.ts';
import { CommitGitUseCase } from '../application/workspaces/commit-git.use-case.ts';
import { CreateGitBranchUseCase } from '../application/workspaces/create-git-branch.use-case.ts';
import { CreateWorkspaceUseCase } from '../application/workspaces/create-workspace.use-case.ts';
import { CreateWorkspaceFileUseCase } from '../application/workspaces/create-workspace-file.use-case.ts';
import { CreateWorkspaceSkillUseCase } from '../application/workspaces/create-workspace-skill.use-case.ts';
import { DeleteWorkspaceUseCase } from '../application/workspaces/delete-workspace.use-case.ts';
import { DeleteWorkspaceFileUseCase } from '../application/workspaces/delete-workspace-file.use-case.ts';
import { DeleteWorkspaceMcpServerUseCase } from '../application/workspaces/delete-workspace-mcp-server.use-case.ts';
import { GetGitDiffUseCase } from '../application/workspaces/get-git-diff.use-case.ts';
import { GetGitFileStatusUseCase } from '../application/workspaces/get-git-file-status.use-case.ts';
import { GetGitStatusUseCase } from '../application/workspaces/get-git-status.use-case.ts';
import { GetWorkspaceFileContentUseCase } from '../application/workspaces/get-workspace-file-content.use-case.ts';
import { GetWorkspaceMcpUseCase } from '../application/workspaces/get-workspace-mcp.use-case.ts';
import { GetWorkspaceMcpConfigUseCase } from '../application/workspaces/get-workspace-mcp-config.use-case.ts';
import { GetWorkspaceStatusUseCase } from '../application/workspaces/get-workspace-status.use-case.ts';
import { InitGitUseCase } from '../application/workspaces/init-git.use-case.ts';
import { ListWorkspaceCapabilitiesUseCase } from '../application/workspaces/list-workspace-capabilities.use-case.ts';
import { ListWorkspaceFileTreeUseCase } from '../application/workspaces/list-workspace-file-tree.use-case.ts';
import { ListWorkspaceFilesUseCase } from '../application/workspaces/list-workspace-files.use-case.ts';
import { ListWorkspaceSkillsUseCase } from '../application/workspaces/list-workspace-skills.use-case.ts';
import { ListWorkspaceToolsUseCase } from '../application/workspaces/list-workspace-tools.use-case.ts';
import { ListWorkspacesUseCase } from '../application/workspaces/list-workspaces.use-case.ts';
import { MoveWorkspaceFilesUseCase } from '../application/workspaces/move-workspace-files.use-case.ts';
import { PickWorkspaceUseCase } from '../application/workspaces/pick-workspace.use-case.ts';
import { PullGitUseCase } from '../application/workspaces/pull-git.use-case.ts';
import { PushGitUseCase } from '../application/workspaces/push-git.use-case.ts';
import { ReloadWorkspaceMcpUseCase } from '../application/workspaces/reload-workspace-mcp.use-case.ts';
import { ReloadWorkspaceSkillsUseCase } from '../application/workspaces/reload-workspace-skills.use-case.ts';
import { RestartMcpServerUseCase } from '../application/workspaces/restart-mcp-server.use-case.ts';
import { RevealWorkspaceUseCase } from '../application/workspaces/reveal-workspace.use-case.ts';
import { SetMcpServerStateUseCase } from '../application/workspaces/set-mcp-server-state.use-case.ts';
import { StageGitUseCase } from '../application/workspaces/stage-git.use-case.ts';
import { UpdateWorkspaceUseCase } from '../application/workspaces/update-workspace.use-case.ts';
import { UpsertWorkspaceMcpServerUseCase } from '../application/workspaces/upsert-workspace-mcp-server.use-case.ts';
import { WipeWorkspaceUseCase } from '../application/workspaces/wipe-workspace.use-case.ts';
import { WriteWorkspaceFileContentUseCase } from '../application/workspaces/write-workspace-file-content.use-case.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import type { NodeSupervisor } from './node-supervisor.ts';

export type WireWorkspaceControllersDeps = {
  app: Hono;
  home: string;
  nodeRegistry: NodeRegistry;
  workspaceRepo: SqliteWorkspaceRepo;
  pluginRepo: SqlitePluginsAdapter;
  workspace: WorkspacePort;
  workspaceFiles: WorkspaceFilesPort;
  filesWatcher: FilesWatcherAdapter;
  git: GitCliAdapter;
  deskEvents: DeskEventsAdapter;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  supervisor?: NodeSupervisor;
};

export function wireWorkspaceControllers(d: WireWorkspaceControllersDeps): void {
  const getWorkspaceMcpConfig = new GetWorkspaceMcpConfigUseCase(
    d.workspaceRepo,
    d.workspaceHarnesys,
    d.pluginRepo,
  );

  new WorkspaceController({
    listWorkspaces: new ListWorkspacesUseCase(d.nodeRegistry, d.workspaceRepo),
    pickWorkspace: new PickWorkspaceUseCase(d.workspace),
    createWorkspace: {
      execute: async (request) => {
        const created = await new CreateWorkspaceUseCase(
          d.nodeRegistry,
          d.workspace,
          d.home,
          d.workspaceRepo,
        ).execute(request);
        const node = d.nodeRegistry.get(created.workspace.id);
        if (node && d.supervisor) {
          d.supervisor.start(node);
        }
        return created;
      },
    },
    updateWorkspace: new UpdateWorkspaceUseCase(
      d.nodeRegistry,
      d.workspaceRepo,
      d.workspaceHarnesys,
    ),
    deleteWorkspace: {
      execute: async (request) => {
        d.supervisor?.stop(request.id);
        await new DeleteWorkspaceUseCase(d.nodeRegistry).execute(request);
      },
    },
    wipeWorkspace: new WipeWorkspaceUseCase({
      nodes: d.nodeRegistry,
      stopRuntime: (id) => d.supervisor?.stop(id),
    }),
    getWorkspaceStatus: new GetWorkspaceStatusUseCase(d.nodeRegistry, d.workspace),
    getGitStatus: new GetGitStatusUseCase(d.workspaceRepo, d.git),
    getGitFileStatus: new GetGitFileStatusUseCase(d.workspaceRepo, d.git),
    getGitDiff: new GetGitDiffUseCase(d.workspaceRepo, d.git),
    initGit: new InitGitUseCase(d.workspaceRepo, d.git),
    checkoutGitBranch: new CheckoutGitBranchUseCase(d.workspaceRepo, d.git),
    createGitBranch: new CreateGitBranchUseCase(d.workspaceRepo, d.git),
    stageGit: new StageGitUseCase(d.workspaceRepo, d.git),
    commitGit: new CommitGitUseCase(d.workspaceRepo, d.git),
    pushGit: new PushGitUseCase(d.workspaceRepo, d.git),
    pullGit: new PullGitUseCase(d.workspaceRepo, d.git),
    listWorkspaceSkills: new ListWorkspaceSkillsUseCase(d.workspaceRepo, d.workspaceHarnesys),
    reloadWorkspaceSkills: new ReloadWorkspaceSkillsUseCase(d.workspaceRepo, d.workspaceHarnesys),
    createWorkspaceSkill: new CreateWorkspaceSkillUseCase(d.workspaceRepo, d.workspaceHarnesys),
    getWorkspaceMcp: new GetWorkspaceMcpUseCase(d.workspaceRepo, d.workspaceHarnesys),
    getWorkspaceMcpConfig,
    reloadWorkspaceMcp: new ReloadWorkspaceMcpUseCase(
      d.workspaceRepo,
      d.workspaceHarnesys,
      getWorkspaceMcpConfig,
    ),
    upsertWorkspaceMcpServer: new UpsertWorkspaceMcpServerUseCase(
      d.workspaceRepo,
      d.workspaceHarnesys,
    ),
    deleteWorkspaceMcpServer: new DeleteWorkspaceMcpServerUseCase(
      d.workspaceRepo,
      d.workspaceHarnesys,
    ),
    setMcpServerState: new SetMcpServerStateUseCase(
      d.workspaceRepo,
      d.workspaceHarnesys,
      d.pluginRepo,
      getWorkspaceMcpConfig,
    ),
    restartMcpServer: new RestartMcpServerUseCase(
      d.workspaceRepo,
      d.workspaceHarnesys,
      getWorkspaceMcpConfig,
    ),
    revealWorkspace: new RevealWorkspaceUseCase(d.workspaceRepo, d.workspace),
    listWorkspaceFiles: new ListWorkspaceFilesUseCase(d.workspaceRepo, d.workspaceFiles),
    listWorkspaceFileTree: new ListWorkspaceFileTreeUseCase(d.workspaceRepo, d.workspaceFiles),
    createWorkspaceFile: new CreateWorkspaceFileUseCase(d.workspaceRepo, d.workspaceFiles),
    deleteWorkspaceFile: new DeleteWorkspaceFileUseCase(d.workspaceRepo, d.workspaceFiles),
    moveWorkspaceFiles: new MoveWorkspaceFilesUseCase(d.workspaceRepo, d.workspaceFiles),
    getWorkspaceFileContent: new GetWorkspaceFileContentUseCase(d.workspaceRepo, d.workspaceFiles),
    writeWorkspaceFileContent: new WriteWorkspaceFileContentUseCase(
      d.workspaceRepo,
      d.workspaceFiles,
    ),
    filesWatcher: d.filesWatcher,
    deskEvents: d.deskEvents,
  }).register(d.app);

  new ToolsController({
    listWorkspaceTools: new ListWorkspaceToolsUseCase(d.workspaceRepo, d.workspaceHarnesys),
  }).register(d.app);

  new CapabilitiesController({
    listWorkspaceCapabilities: new ListWorkspaceCapabilitiesUseCase(
      d.workspaceRepo,
      d.workspaceHarnesys,
    ),
  }).register(d.app);

  new TerminalController({
    app: d.app,
    workspaceRepo: d.workspaceRepo,
  }).register();
}
