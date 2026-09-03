import type { RunClaimer, RunLifecycleStore } from 'harnesys';
import type { Hono } from 'hono';
import type { ActiveRunRegistry } from '../adapters/active-runs.adapter.ts';
import type { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import type { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { AgentController } from '../adapters/http/agent/agent.controller.ts';
import { CatalogController } from '../adapters/http/catalog/catalog.controller.ts';
import { ProviderController } from '../adapters/http/provider/provider.controller.ts';
import { ThreadController } from '../adapters/http/thread/thread.controller.ts';
import { ToolsController } from '../adapters/http/workspace/tools.controller.ts';
import { WorkspaceController } from '../adapters/http/workspace/workspace.controller.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import type { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import type { SqliteAttachmentRepo } from '../adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import type { SqliteLlmModelRepo } from '../adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import type { SqliteLlmProviderRepo } from '../adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import type { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import type { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import type { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import type { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import type { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { ThreadSessionsAdapter } from '../adapters/thread-sessions.adapter.ts';
import type { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import type { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import type { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { CreateAgentUseCase } from '../application/agents/create-agent.use-case.ts';
import { DeleteAgentUseCase } from '../application/agents/delete-agent.use-case.ts';
import { ListAgentsUseCase } from '../application/agents/list-agents.use-case.ts';
import { UpdateAgentUseCase } from '../application/agents/update-agent.use-case.ts';
import { GetCatalogUseCase } from '../application/catalog/get-catalog.use-case.ts';
import { GetThreadPlanUseCase } from '../application/plans/get-thread-plan.use-case.ts';
import { CreateProviderUseCase } from '../application/providers/create-provider.use-case.ts';
import { CreateProviderModelUseCase } from '../application/providers/create-provider-model.use-case.ts';
import { DeleteProviderUseCase } from '../application/providers/delete-provider.use-case.ts';
import { DeleteProviderModelUseCase } from '../application/providers/delete-provider-model.use-case.ts';
import { DiscoverProviderModelsUseCase } from '../application/providers/discover-provider-models.use-case.ts';
import { GetProviderUseCase } from '../application/providers/get-provider.use-case.ts';
import { ListProvidersUseCase } from '../application/providers/list-providers.use-case.ts';
import { UpdateProviderUseCase } from '../application/providers/update-provider.use-case.ts';
import { UpdateProviderModelUseCase } from '../application/providers/update-provider-model.use-case.ts';
import { CancelRunUseCase } from '../application/threads/cancel-run.use-case.ts';
import { CompactThreadUseCase } from '../application/threads/compact-thread.use-case.ts';
import { CreateThreadUseCase } from '../application/threads/create-thread.use-case.ts';
import { CreateThreadAttachmentUseCase } from '../application/threads/create-thread-attachment.use-case.ts';
import { DeleteThreadUseCase } from '../application/threads/delete-thread.use-case.ts';
import { GetThreadUseCase } from '../application/threads/get-thread.use-case.ts';
import { GetThreadAttachmentUseCase } from '../application/threads/get-thread-attachment.use-case.ts';
import { ListThreadPendingAttachmentsUseCase } from '../application/threads/list-thread-pending-attachments.use-case.ts';
import { ListThreadsUseCase } from '../application/threads/list-threads.use-case.ts';
import { MarkThreadReadUseCase } from '../application/threads/mark-thread-read.use-case.ts';
import { RespondRunUseCase } from '../application/threads/respond-run.use-case.ts';
import { RetryRunUseCase } from '../application/threads/retry-run.use-case.ts';
import { SendThreadRunUseCase } from '../application/threads/send-thread-run.use-case.ts';
import { StreamRunEventsUseCase } from '../application/threads/stream-run-events.use-case.ts';
import { UpdateThreadUseCase } from '../application/threads/update-thread.use-case.ts';
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
import { ListWorkspaceFilesUseCase } from '../application/workspaces/list-workspace-files.use-case.ts';
import { ListWorkspaceSkillsUseCase } from '../application/workspaces/list-workspace-skills.use-case.ts';
import { ListWorkspaceToolsUseCase } from '../application/workspaces/list-workspace-tools.use-case.ts';
import { ListWorkspacesUseCase } from '../application/workspaces/list-workspaces.use-case.ts';
import { PickWorkspaceUseCase } from '../application/workspaces/pick-workspace.use-case.ts';
import { PullGitUseCase } from '../application/workspaces/pull-git.use-case.ts';
import { PushGitUseCase } from '../application/workspaces/push-git.use-case.ts';
import { ReloadWorkspaceMcpUseCase } from '../application/workspaces/reload-workspace-mcp.use-case.ts';
import { ReloadWorkspaceSkillsUseCase } from '../application/workspaces/reload-workspace-skills.use-case.ts';
import { RevealWorkspaceUseCase } from '../application/workspaces/reveal-workspace.use-case.ts';
import { StageGitUseCase } from '../application/workspaces/stage-git.use-case.ts';
import { UpdateWorkspaceUseCase } from '../application/workspaces/update-workspace.use-case.ts';
import { UpsertWorkspaceMcpServerUseCase } from '../application/workspaces/upsert-workspace-mcp-server.use-case.ts';
import { WriteWorkspaceFileContentUseCase } from '../application/workspaces/write-workspace-file-content.use-case.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';

type ControllerDeps = {
  app: Hono;
  home: string;
  workspaceRepo: SqliteWorkspaceRepo;
  agentRepo: SqliteAgentRepo;
  llmProviderRepo: SqliteLlmProviderRepo;
  llmModelRepo: SqliteLlmModelRepo;
  scheduleRepo: SqliteScheduleRepo;
  webhookRepo: SqliteWebhookRepo;
  threadRepo: SqliteThreadRepo;
  attachmentRepo: SqliteAttachmentRepo;
  activeRuns: ActiveRunRegistry;
  workspace: WorkspaceAdapter;
  workspaceFiles: WorkspaceFilesAdapter;
  filesWatcher: FilesWatcherAdapter;
  git: GitCliAdapter;
  deskEvents: DeskEventsAdapter;
  attachments: AttachmentsPort;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  threadRegistry: ThreadRuntimeRegistry;
  runtimeStateRepo: SqliteRuntimeStateRepo;
  lifecycle: RunLifecycleStore;
  claimer: RunClaimer;
  memory: StudioMemoryPorts;
  db: StudioDb;
};

export function wireControllers(d: ControllerDeps): void {
  const getWorkspaceMcpConfig = new GetWorkspaceMcpConfigUseCase(
    d.workspaceRepo,
    d.workspaceHarnesys,
  );

  new WorkspaceController({
    listWorkspaces: new ListWorkspacesUseCase(d.workspaceRepo),
    pickWorkspace: new PickWorkspaceUseCase(d.workspace),
    createWorkspace: new CreateWorkspaceUseCase(d.workspaceRepo, d.workspace, d.home),
    updateWorkspace: new UpdateWorkspaceUseCase(d.workspaceRepo, d.workspaceHarnesys),
    deleteWorkspace: new DeleteWorkspaceUseCase({
      workspaces: d.workspaceRepo,
      agents: d.agentRepo,
      threads: d.threadRepo,
      attachments: d.attachmentRepo,
      attachmentsFs: d.attachments,
      db: d.db,
      workspaceHarnesys: d.workspaceHarnesys,
      schedules: d.scheduleRepo,
    }),
    getWorkspaceStatus: new GetWorkspaceStatusUseCase(d.workspaceRepo, d.workspace),
    getGitStatus: new GetGitStatusUseCase(d.workspaceRepo, d.git),
    getGitFileStatus: new GetGitFileStatusUseCase(d.workspaceRepo, d.git),
    getGitDiff: new GetGitDiffUseCase(d.workspaceRepo, d.git),
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
    revealWorkspace: new RevealWorkspaceUseCase(d.workspaceRepo, d.workspace),
    listWorkspaceFiles: new ListWorkspaceFilesUseCase(d.workspaceRepo, d.workspaceFiles),
    createWorkspaceFile: new CreateWorkspaceFileUseCase(d.workspaceRepo, d.workspaceFiles),
    deleteWorkspaceFile: new DeleteWorkspaceFileUseCase(d.workspaceRepo, d.workspaceFiles),
    getWorkspaceFileContent: new GetWorkspaceFileContentUseCase(d.workspaceRepo, d.workspaceFiles),
    writeWorkspaceFileContent: new WriteWorkspaceFileContentUseCase(
      d.workspaceRepo,
      d.workspaceFiles,
    ),
    filesWatcher: d.filesWatcher,
    deskEvents: d.deskEvents,
  }).register(d.app);

  new CatalogController({
    getCatalog: new GetCatalogUseCase(),
  }).register(d.app);

  new ToolsController({
    listWorkspaceTools: new ListWorkspaceToolsUseCase(d.workspaceRepo, d.workspaceHarnesys),
  }).register(d.app);

  new ProviderController({
    listProviders: new ListProvidersUseCase(d.llmProviderRepo, d.llmModelRepo),
    getProvider: new GetProviderUseCase(d.llmProviderRepo, d.llmModelRepo),
    createProvider: new CreateProviderUseCase(d.llmProviderRepo),
    updateProvider: new UpdateProviderUseCase(d.llmProviderRepo, d.llmModelRepo),
    deleteProvider: new DeleteProviderUseCase(d.llmProviderRepo),
    discoverProviderModels: new DiscoverProviderModelsUseCase(d.llmProviderRepo),
    createProviderModel: new CreateProviderModelUseCase(d.llmProviderRepo, d.llmModelRepo),
    updateProviderModel: new UpdateProviderModelUseCase(d.llmProviderRepo, d.llmModelRepo),
    deleteProviderModel: new DeleteProviderModelUseCase(d.llmProviderRepo, d.llmModelRepo),
  }).register(d.app);

  new AgentController({
    listAgents: new ListAgentsUseCase(d.agentRepo),
    createAgent: new CreateAgentUseCase(d.agentRepo),
    updateAgent: new UpdateAgentUseCase(d.agentRepo),
    deleteAgent: new DeleteAgentUseCase(d.agentRepo, d.threadRepo),
  }).register(d.app);

  const getThread = new GetThreadUseCase(d.threadRepo, d.agentRepo, d.db);
  const planUow = new SqliteUnitOfWork(d.db);
  const getThreadPlan = new GetThreadPlanUseCase(planUow);
  const sessions = new ThreadSessionsAdapter({
    threads: d.threadRepo,
    workspaces: d.workspaceRepo,
    workspaceHarnesys: d.workspaceHarnesys,
    registry: d.threadRegistry,
  });
  const sendThreadRun = new SendThreadRunUseCase({
    threads: d.threadRepo,
    agents: d.agentRepo,
    models: d.llmModelRepo,
    providers: d.llmProviderRepo,
    workspaces: d.workspaceRepo,
    attachments: d.attachmentRepo,
    workspaceHarnesys: d.workspaceHarnesys,
    registry: d.threadRegistry,
    activeRuns: d.activeRuns,
    deskEvents: d.deskEvents,
    getThread,
    getThreadPlan,
  });

  new ThreadController({
    listThreads: new ListThreadsUseCase(d.threadRepo, d.workspaceRepo, d.agentRepo),
    getThread,
    getThreadPlan,
    createThread: new CreateThreadUseCase(d.threadRepo, d.agentRepo, d.workspaceRepo),
    updateThread: new UpdateThreadUseCase(d.threadRepo, d.agentRepo, d.db),
    markThreadRead: new MarkThreadReadUseCase(d.threadRepo, d.agentRepo, d.db),
    deleteThread: new DeleteThreadUseCase({
      threads: d.threadRepo,
      workspaces: d.workspaceRepo,
      attachments: d.attachmentRepo,
      attachmentsFs: d.attachments,
      schedules: d.scheduleRepo,
      semanticSessions: d.memory.semantic,
    }),
    sendThreadRun,
    compactThread: new CompactThreadUseCase(),
    streamRunEvents: new StreamRunEventsUseCase(d.activeRuns),
    cancelRun: new CancelRunUseCase({ lifecycle: d.lifecycle, sessions }),
    respondRun: new RespondRunUseCase({
      lifecycle: d.lifecycle,
      sessions,
      getThread,
      deskEvents: d.deskEvents,
    }),
    retryRun: new RetryRunUseCase({ lifecycle: d.lifecycle, sessions, claimer: d.claimer }),
    createThreadAttachment: new CreateThreadAttachmentUseCase({
      threads: d.threadRepo,
      agents: d.agentRepo,
      models: d.llmModelRepo,
      workspaces: d.workspaceRepo,
      attachments: d.attachmentRepo,
      attachmentsFs: d.attachments,
    }),
    getThreadAttachment: new GetThreadAttachmentUseCase(
      d.threadRepo,
      d.workspaceRepo,
      d.attachmentRepo,
      d.attachments,
    ),
    listThreadPendingAttachments: new ListThreadPendingAttachmentsUseCase(d.attachmentRepo),
  }).register(d.app);
}
