import { join } from 'node:path';
import { Hono } from 'hono';
import { ActiveRunRegistry } from '../adapters/active-runs.adapter.ts';
import { FsAttachmentsAdapter } from '../adapters/attachments/fs-attachments.adapter.ts';
import { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { AgentController } from '../adapters/http/agent/agent.controller.ts';
import { CatalogController } from '../adapters/http/catalog/catalog.controller.ts';
import { handleHttpError } from '../adapters/http/http.error.ts';
import { ProviderController } from '../adapters/http/provider/provider.controller.ts';
import { ThreadController } from '../adapters/http/thread/thread.controller.ts';
import { ToolsController } from '../adapters/http/workspace/tools.controller.ts';
import { WorkspaceController } from '../adapters/http/workspace/workspace.controller.ts';
import { bootstrap } from '../adapters/store/sqlite/bootstrap.ts';
import { createSqliteConnection, type StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import { SqliteAttachmentRepo } from '../adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import { SqliteLlmModelRepo } from '../adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import { SqliteLlmProviderRepo } from '../adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import { DB_FILE, defaultHomePath } from '../adapters/store/studio-layout.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
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
import { ResumeThreadRunUseCase } from '../application/threads/resume-thread-run.use-case.ts';
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
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import { wireHostTools } from './wire-host-tools.ts';
import { createStudioMemory, registerMemoryHttp } from './wire-memory.ts';
import { wireSchedules } from './wire-schedules.ts';
export type StudioOptions = {
  db?: StudioDb;
  workspace?: WorkspacePort;
  workspaceFiles?: WorkspaceFilesPort;
  attachments?: AttachmentsPort;
  workspaceHarnesys?: WorkspaceHarnesysRegistry;
  activeRuns?: ActiveRunRegistry;
};

export function createStudio(options: StudioOptions = {}): Hono {
  const home = defaultHomePath();
  const db = options.db ?? createSqliteConnection(join(home, DB_FILE));
  if (!options.db) {
    bootstrap(db);
  }

  const workspaceRepo = new SqliteWorkspaceRepo(db);
  const agentRepo = new SqliteAgentRepo(db);
  const llmProviderRepo = new SqliteLlmProviderRepo(db);
  const llmModelRepo = new SqliteLlmModelRepo(db);
  const scheduleRepo = new SqliteScheduleRepo(db);
  const webhookRepo = new SqliteWebhookRepo(db);
  const threadRepo = new SqliteThreadRepo(db);
  const attachmentRepo = new SqliteAttachmentRepo(db);
  const activeRuns = options.activeRuns ?? new ActiveRunRegistry();

  const workspace = options.workspace ?? new WorkspaceAdapter();
  const workspaceFiles = options.workspaceFiles ?? new WorkspaceFilesAdapter();
  const filesWatcher = new FilesWatcherAdapter();
  const git = new GitCliAdapter();
  const deskEvents = new DeskEventsAdapter();
  const attachments = options.attachments ?? new FsAttachmentsAdapter();
  const modelsPort = createHarnesysModelsPort(llmProviderRepo, llmModelRepo);
  const runtimeStateRepo = new SqliteRuntimeStateRepo(db);
  const memory = createStudioMemory(db, {
    runtimeState: runtimeStateRepo,
    providers: llmProviderRepo,
    models: llmModelRepo,
    workspaces: workspaceRepo,
    filesWatcher,
  });
  const workspaceHarnesys =
    options.workspaceHarnesys ?? new WorkspaceHarnesysRegistry(modelsPort, agentRepo);
  const threadRegistry = new ThreadRuntimeRegistry(runtimeStateRepo);
  const getWorkspaceMcpConfig = new GetWorkspaceMcpConfigUseCase(workspaceRepo, workspaceHarnesys);

  const app = new Hono();

  new WorkspaceController({
    listWorkspaces: new ListWorkspacesUseCase(workspaceRepo),
    pickWorkspace: new PickWorkspaceUseCase(workspace),
    createWorkspace: new CreateWorkspaceUseCase(workspaceRepo, workspace, home),
    updateWorkspace: new UpdateWorkspaceUseCase(workspaceRepo, workspaceHarnesys),
    deleteWorkspace: new DeleteWorkspaceUseCase({
      workspaces: workspaceRepo,
      agents: agentRepo,
      threads: threadRepo,
      attachments: attachmentRepo,
      attachmentsFs: attachments,
      db,
      workspaceHarnesys,
      schedules: scheduleRepo,
    }),
    getWorkspaceStatus: new GetWorkspaceStatusUseCase(workspaceRepo, workspace),
    getGitStatus: new GetGitStatusUseCase(workspaceRepo, git),
    getGitFileStatus: new GetGitFileStatusUseCase(workspaceRepo, git),
    getGitDiff: new GetGitDiffUseCase(workspaceRepo, git),
    checkoutGitBranch: new CheckoutGitBranchUseCase(workspaceRepo, git),
    createGitBranch: new CreateGitBranchUseCase(workspaceRepo, git),
    stageGit: new StageGitUseCase(workspaceRepo, git),
    commitGit: new CommitGitUseCase(workspaceRepo, git),
    pushGit: new PushGitUseCase(workspaceRepo, git),
    pullGit: new PullGitUseCase(workspaceRepo, git),
    listWorkspaceSkills: new ListWorkspaceSkillsUseCase(workspaceRepo, workspaceHarnesys),
    reloadWorkspaceSkills: new ReloadWorkspaceSkillsUseCase(workspaceRepo, workspaceHarnesys),
    createWorkspaceSkill: new CreateWorkspaceSkillUseCase(workspaceRepo, workspaceHarnesys),
    getWorkspaceMcp: new GetWorkspaceMcpUseCase(workspaceRepo, workspaceHarnesys),
    getWorkspaceMcpConfig,
    reloadWorkspaceMcp: new ReloadWorkspaceMcpUseCase(
      workspaceRepo,
      workspaceHarnesys,
      getWorkspaceMcpConfig,
    ),
    upsertWorkspaceMcpServer: new UpsertWorkspaceMcpServerUseCase(workspaceRepo, workspaceHarnesys),
    deleteWorkspaceMcpServer: new DeleteWorkspaceMcpServerUseCase(workspaceRepo, workspaceHarnesys),
    revealWorkspace: new RevealWorkspaceUseCase(workspaceRepo, workspace),
    listWorkspaceFiles: new ListWorkspaceFilesUseCase(workspaceRepo, workspaceFiles),
    createWorkspaceFile: new CreateWorkspaceFileUseCase(workspaceRepo, workspaceFiles),
    deleteWorkspaceFile: new DeleteWorkspaceFileUseCase(workspaceRepo, workspaceFiles),
    getWorkspaceFileContent: new GetWorkspaceFileContentUseCase(workspaceRepo, workspaceFiles),
    writeWorkspaceFileContent: new WriteWorkspaceFileContentUseCase(workspaceRepo, workspaceFiles),
    filesWatcher,
    deskEvents,
  }).register(app);

  new CatalogController({
    getCatalog: new GetCatalogUseCase(),
  }).register(app);

  new ToolsController({
    listWorkspaceTools: new ListWorkspaceToolsUseCase(workspaceRepo, workspaceHarnesys),
  }).register(app);

  new ProviderController({
    listProviders: new ListProvidersUseCase(llmProviderRepo, llmModelRepo),
    getProvider: new GetProviderUseCase(llmProviderRepo, llmModelRepo),
    createProvider: new CreateProviderUseCase(llmProviderRepo),
    updateProvider: new UpdateProviderUseCase(llmProviderRepo, llmModelRepo),
    deleteProvider: new DeleteProviderUseCase(llmProviderRepo),
    discoverProviderModels: new DiscoverProviderModelsUseCase(llmProviderRepo),
    createProviderModel: new CreateProviderModelUseCase(llmProviderRepo, llmModelRepo),
    updateProviderModel: new UpdateProviderModelUseCase(llmProviderRepo, llmModelRepo),
    deleteProviderModel: new DeleteProviderModelUseCase(llmProviderRepo, llmModelRepo),
  }).register(app);

  new AgentController({
    listAgents: new ListAgentsUseCase(agentRepo),
    createAgent: new CreateAgentUseCase(agentRepo),
    updateAgent: new UpdateAgentUseCase(agentRepo),
    deleteAgent: new DeleteAgentUseCase(agentRepo),
  }).register(app);

  registerMemoryHttp(app, memory, { agents: agentRepo, workspaces: workspaceRepo });

  const getThread = new GetThreadUseCase(threadRepo, agentRepo, db);
  const planUow = new SqliteUnitOfWork(db);
  const getThreadPlan = new GetThreadPlanUseCase(planUow);
  const sendThreadRun = new SendThreadRunUseCase({
    threads: threadRepo,
    agents: agentRepo,
    models: llmModelRepo,
    providers: llmProviderRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    workspaceHarnesys,
    registry: threadRegistry,
    activeRuns,
    deskEvents,
    getThread,
    getThreadPlan,
  });

  const scheduleQueue = wireSchedules({
    app,
    db,
    startTicker: !options.db,
    schedules: scheduleRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: attachments,
    activeRuns,
    deskEvents,
    sendThreadRun,
    getThread,
    semanticSessions: memory.semantic,
  });

  wireHostTools({
    db,
    workspaceHarnesys,
    schedules: scheduleRepo,
    webhooks: webhookRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: attachments,
    activeRuns,
    queue: scheduleQueue,
    deskEvents,
    semanticSessions: memory.semantic,
  });
  new ThreadController({
    listThreads: new ListThreadsUseCase(threadRepo, workspaceRepo, agentRepo),
    getThread,
    getThreadPlan,
    createThread: new CreateThreadUseCase(threadRepo, agentRepo, workspaceRepo),
    updateThread: new UpdateThreadUseCase(threadRepo, agentRepo, db),
    markThreadRead: new MarkThreadReadUseCase(threadRepo, agentRepo, db),
    deleteThread: new DeleteThreadUseCase({
      threads: threadRepo,
      workspaces: workspaceRepo,
      attachments: attachmentRepo,
      attachmentsFs: attachments,
      schedules: scheduleRepo,
      semanticSessions: memory.semantic,
    }),
    sendThreadRun,
    compactThread: new CompactThreadUseCase(),
    resumeThreadRun: new ResumeThreadRunUseCase({
      threads: threadRepo,
      agents: agentRepo,
      models: llmModelRepo,
      providers: llmProviderRepo,
      workspaces: workspaceRepo,
      workspaceHarnesys,
      registry: threadRegistry,
      activeRuns,
      deskEvents,
      getThread,
    }),
    streamRunEvents: new StreamRunEventsUseCase(activeRuns),
    cancelRun: new CancelRunUseCase(activeRuns),
    respondRun: new RespondRunUseCase(activeRuns),
    createThreadAttachment: new CreateThreadAttachmentUseCase({
      threads: threadRepo,
      agents: agentRepo,
      models: llmModelRepo,
      workspaces: workspaceRepo,
      attachments: attachmentRepo,
      attachmentsFs: attachments,
    }),
    getThreadAttachment: new GetThreadAttachmentUseCase(
      threadRepo,
      workspaceRepo,
      attachmentRepo,
      attachments,
    ),
    listThreadPendingAttachments: new ListThreadPendingAttachmentsUseCase(attachmentRepo),
  }).register(app);

  app.onError(handleHttpError);
  return app;
}
