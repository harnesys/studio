import type { ModelsPort, RunClaimer, RunEventFeed, RunLifecycleStore } from 'harnesys';
import type { Hono } from 'hono';
import type { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import type { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { CatalogController } from '../adapters/http/catalog/catalog.controller.ts';
import { LspController } from '../adapters/http/lsp/lsp.controller.ts';
import { ModePresetController } from '../adapters/http/mode-preset/mode-preset.controller.ts';
import { ProviderController } from '../adapters/http/provider/provider.controller.ts';
import { ThreadController } from '../adapters/http/thread/thread.controller.ts';
import { WindowDeskController } from '../adapters/http/window/window-desk.controller.ts';
import type { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import type { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import type { SqliteAttachmentRepo } from '../adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import type { SqliteLlmModelRepo } from '../adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import type { SqliteLlmProviderRepo } from '../adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import type { SqliteModePresetRepo } from '../adapters/store/sqlite/repos/sqlite-mode-preset.repo.ts';
import type { SqlitePluginRegistriesAdapter } from '../adapters/store/sqlite/repos/sqlite-plugin-registries.adapter.ts';
import type { SqlitePluginsAdapter } from '../adapters/store/sqlite/repos/sqlite-plugins.adapter.ts';
import type { SqliteRunEventStore } from '../adapters/store/sqlite/repos/sqlite-run-events.adapter.ts';
import type { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import type { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import type { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import type { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import type { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { ThreadSessionsAdapter } from '../adapters/thread-sessions.adapter.ts';
import type { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { GetCatalogUseCase } from '../application/catalog/get-catalog.use-case.ts';
import { CreateModePresetUseCase } from '../application/mode-presets/create-mode-preset.use-case.ts';
import { DeleteModePresetUseCase } from '../application/mode-presets/delete-mode-preset.use-case.ts';
import { ListModePresetsUseCase } from '../application/mode-presets/list-mode-presets.use-case.ts';
import { UpdateModePresetUseCase } from '../application/mode-presets/update-mode-preset.use-case.ts';
import type { NodeRegistry } from '../application/nodes/node-registry.ts';
import type { GetThreadPlanInput } from '../application/plans/get-thread-plan.use-case.ts';
import { CreateProviderUseCase } from '../application/providers/create-provider.use-case.ts';
import { CreateProviderModelUseCase } from '../application/providers/create-provider-model.use-case.ts';
import { DeleteProviderUseCase } from '../application/providers/delete-provider.use-case.ts';
import { DeleteProviderModelUseCase } from '../application/providers/delete-provider-model.use-case.ts';
import { DiscoverProviderModelsUseCase } from '../application/providers/discover-provider-models.use-case.ts';
import { ExportProvidersUseCase } from '../application/providers/export-providers.use-case.ts';
import { GetProviderUseCase } from '../application/providers/get-provider.use-case.ts';
import { ImportProvidersUseCase } from '../application/providers/import-providers.use-case.ts';
import { ListProvidersUseCase } from '../application/providers/list-providers.use-case.ts';
import { UpdateProviderUseCase } from '../application/providers/update-provider.use-case.ts';
import { UpdateProviderModelUseCase } from '../application/providers/update-provider-model.use-case.ts';
import { CancelRunUseCase } from '../application/threads/cancel-run.use-case.ts';
import {
  CompactThreadUseCase,
  type ThreadRunHooks,
} from '../application/threads/compact-thread.use-case.ts';
import { CreateThreadUseCase } from '../application/threads/create-thread.use-case.ts';
import { CreateThreadAttachmentUseCase } from '../application/threads/create-thread-attachment.use-case.ts';
import { DeleteThreadUseCase } from '../application/threads/delete-thread.use-case.ts';
import type { GetThreadInput } from '../application/threads/get-thread.use-case.ts';
import { GetThreadAttachmentUseCase } from '../application/threads/get-thread-attachment.use-case.ts';
import { ListThreadPendingAttachmentsUseCase } from '../application/threads/list-thread-pending-attachments.use-case.ts';
import { ListThreadsUseCase } from '../application/threads/list-threads.use-case.ts';
import { MarkThreadReadUseCase } from '../application/threads/mark-thread-read.use-case.ts';
import { RespondRunUseCase } from '../application/threads/respond-run.use-case.ts';
import { RetryRunUseCase } from '../application/threads/retry-run.use-case.ts';
import type { SendThreadRunInput } from '../application/threads/send-thread-run.use-case.ts';
import { StreamRunEventsUseCase } from '../application/threads/stream-run-events.use-case.ts';
import { UpdateThreadUseCase } from '../application/threads/update-thread.use-case.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { MachineConfigPort } from '../domain/machine-config.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import type { NodeSupervisor } from './node-supervisor.ts';
import { wireAgentControllers } from './wire-agent-controllers.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';
import { wirePluginControllers } from './wire-plugin-controllers.ts';
import { wireWorkspaceControllers } from './wire-workspace-controllers.ts';

type ControllerDeps = {
  app: Hono;
  home: string;
  machineConfig: MachineConfigPort;
  nodeRegistry: NodeRegistry;
  workspaceRepo: SqliteWorkspaceRepo;
  agentRepo: SqliteAgentRepo;
  llmProviderRepo: SqliteLlmProviderRepo;
  llmModelRepo: SqliteLlmModelRepo;
  modePresetRepo: SqliteModePresetRepo;
  scheduleRepo: SqliteScheduleRepo;
  webhookRepo: SqliteWebhookRepo;
  threadRepo: SqliteThreadRepo;
  attachmentRepo: SqliteAttachmentRepo;
  pluginRepo: SqlitePluginsAdapter;
  pluginRegistryRepo: SqlitePluginRegistriesAdapter;
  workspace: WorkspacePort;
  workspaceFiles: WorkspaceFilesPort;
  filesWatcher: FilesWatcherAdapter;
  git: GitCliAdapter;
  deskEvents: DeskEventsAdapter;
  attachments: AttachmentsPort;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  lsp: StudioLspAdapter;
  secretStore?: SecretStore;
  threadRegistry: ThreadRuntimeRegistry;
  runtimeStateRepo: SqliteRuntimeStateRepo;
  lifecycle: RunLifecycleStore;
  events: SqliteRunEventStore;
  claimer: RunClaimer;
  feed: RunEventFeed;
  memory: StudioMemoryPorts;
  db?: StudioDb;
  modelsPort: ModelsPort;
  supervisor?: NodeSupervisor;
  getThread: GetThreadInput;
  getThreadPlan: GetThreadPlanInput;
  sendThreadRun: SendThreadRunInput;
  threadRunHooks: ThreadRunHooks;
};
export function wireControllers(d: ControllerDeps): void {
  wireWorkspaceControllers({
    app: d.app,
    home: d.home,
    nodeRegistry: d.nodeRegistry,
    workspaceRepo: d.workspaceRepo,
    pluginRepo: d.pluginRepo,
    workspace: d.workspace,
    workspaceFiles: d.workspaceFiles,
    filesWatcher: d.filesWatcher,
    git: d.git,
    deskEvents: d.deskEvents,
    workspaceHarnesys: d.workspaceHarnesys,
    supervisor: d.supervisor,
  });
  new WindowDeskController({ machineConfig: d.machineConfig }).register(d.app);
  new CatalogController({
    getCatalog: new GetCatalogUseCase(),
  }).register(d.app);
  wirePluginControllers({
    app: d.app,
    home: d.home,
    pluginRepo: d.pluginRepo,
    pluginRegistryRepo: d.pluginRegistryRepo,
    workspaceRepo: d.workspaceRepo,
    workspaceHarnesys: d.workspaceHarnesys,
    lsp: d.lsp,
    secretStore: d.secretStore,
    supervisor: d.supervisor,
  });
  new LspController({ workspaceRepo: d.workspaceRepo, supervisor: d.supervisor }).register(d.app);
  new ProviderController({
    listProviders: new ListProvidersUseCase(d.llmProviderRepo, d.llmModelRepo),
    getProvider: new GetProviderUseCase(d.llmProviderRepo, d.llmModelRepo),
    createProvider: new CreateProviderUseCase(d.llmProviderRepo),
    updateProvider: new UpdateProviderUseCase(d.llmProviderRepo, d.llmModelRepo),
    deleteProvider: new DeleteProviderUseCase(d.llmProviderRepo),
    exportProviders: new ExportProvidersUseCase(d.llmProviderRepo, d.llmModelRepo),
    importProviders: new ImportProvidersUseCase(d.llmProviderRepo, d.llmModelRepo),
    discoverProviderModels: new DiscoverProviderModelsUseCase(d.llmProviderRepo),
    createProviderModel: new CreateProviderModelUseCase(d.llmProviderRepo, d.llmModelRepo),
    updateProviderModel: new UpdateProviderModelUseCase(d.llmProviderRepo, d.llmModelRepo),
    deleteProviderModel: new DeleteProviderModelUseCase(d.llmProviderRepo, d.llmModelRepo),
  }).register(d.app);
  wireAgentControllers({
    app: d.app,
    agentRepo: d.agentRepo,
    threadRepo: d.threadRepo,
    scheduleRepo: d.scheduleRepo,
    webhookRepo: d.webhookRepo,
    memory: d.memory,
    modePresetRepo: d.modePresetRepo,
    workspaceRepo: d.workspaceRepo,
    workspaceHarnesys: d.workspaceHarnesys,
    deskEvents: d.deskEvents,
  });
  new ModePresetController({
    listModePresets: new ListModePresetsUseCase(d.modePresetRepo),
    createModePreset: new CreateModePresetUseCase(d.modePresetRepo),
    updateModePreset: new UpdateModePresetUseCase(d.modePresetRepo),
    deleteModePreset: new DeleteModePresetUseCase(d.modePresetRepo),
  }).register(d.app);
  const sessions = new ThreadSessionsAdapter({
    threads: d.threadRepo,
    workspaces: d.workspaceRepo,
    workspaceHarnesys: d.workspaceHarnesys,
    registry: d.threadRegistry,
  });
  new ThreadController({
    listThreads: new ListThreadsUseCase(d.threadRepo, d.workspaceRepo, d.agentRepo, d.lifecycle),
    getThread: d.getThread,
    getThreadPlan: d.getThreadPlan,
    createThread: new CreateThreadUseCase(d.threadRepo, d.agentRepo, d.workspaceRepo),
    updateThread: new UpdateThreadUseCase(d.threadRepo, d.agentRepo, d.events, d.lifecycle),
    markThreadRead: new MarkThreadReadUseCase(d.threadRepo, d.agentRepo, d.lifecycle),
    deleteThread: new DeleteThreadUseCase({
      threads: d.threadRepo,
      workspaces: d.workspaceRepo,
      attachments: d.attachmentRepo,
      attachmentsFs: d.attachments,
      schedules: d.scheduleRepo,
      webhooks: d.webhookRepo,
      semanticSessions: d.memory.semantic,
    }),
    sendThreadRun: d.sendThreadRun,
    compactThread: new CompactThreadUseCase({
      threads: d.threadRepo,
      agents: d.agentRepo,
      workspaces: d.workspaceRepo,
      workspaceHarnesys: d.workspaceHarnesys,
      registry: d.threadRegistry,
      runtimeStates: d.runtimeStateRepo,
      models: d.modelsPort,
      episodic: d.memory.episodic,
      deskEvents: d.deskEvents,
      getThread: d.getThread,
      runEvents: d.events,
      runHooks: d.threadRunHooks,
      lifecycle: d.lifecycle,
    }),
    streamRunEvents: new StreamRunEventsUseCase({
      lifecycle: d.lifecycle,
      runEvents: d.events,
      feed: d.feed,
    }),
    cancelRun: new CancelRunUseCase({ lifecycle: d.lifecycle, sessions }),
    lifecycle: d.lifecycle,
    respondRun: new RespondRunUseCase({
      lifecycle: d.lifecycle,
      sessions,
      getThread: d.getThread,
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
