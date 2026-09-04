import { join } from 'node:path';
import {
  createRunClaimer,
  createRunEngine,
  createRunEventBus,
  createRunEventFeed,
  createToolRegistry,
  type RunTargets,
} from 'harnesys';
import { askUser, fetch, files, shell } from 'harnesys/actions';
import { Hono } from 'hono';
import { FsAttachmentsAdapter } from '../adapters/attachments/fs-attachments.adapter.ts';
import { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { handleHttpError } from '../adapters/http/http.error.ts';
import { bootstrap } from '../adapters/store/sqlite/bootstrap.ts';
import { createSqliteConnection, type StudioDb } from '../adapters/store/sqlite/connection.ts';
import { SqliteAgentRepo } from '../adapters/store/sqlite/repos/sqlite-agent.repo.ts';
import { SqliteAttachmentRepo } from '../adapters/store/sqlite/repos/sqlite-attachment.repo.ts';
import { SqliteLlmModelRepo } from '../adapters/store/sqlite/repos/sqlite-llm-model.repo.ts';
import { SqliteLlmProviderRepo } from '../adapters/store/sqlite/repos/sqlite-llm-provider.repo.ts';
import { SqliteRunEventStore } from '../adapters/store/sqlite/repos/sqlite-run-events.adapter.ts';
import { SqliteRunLifecycleStore } from '../adapters/store/sqlite/repos/sqlite-run-lifecycle.adapter.ts';
import { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import { DB_FILE, defaultHomePath } from '../adapters/store/studio-layout.ts';
import { StudioRunTargets } from '../adapters/studio-run-targets.adapter.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { env } from '../config/env.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import { wireControllers } from './wire-controllers.ts';
import { wireHostTools } from './wire-host-tools.ts';
import { createStudioMemory, registerMemoryHttp } from './wire-memory.ts';
import { wireSchedules } from './wire-schedules.ts';

export type StudioOptions = {
  db?: StudioDb;
  workspace?: WorkspacePort;
  workspaceFiles?: WorkspaceFilesPort;
  attachments?: AttachmentsPort;
  workspaceHarnesys?: WorkspaceHarnesysRegistry;
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

  const workspace = options.workspace ?? new WorkspaceAdapter();
  const workspaceFiles = options.workspaceFiles ?? new WorkspaceFilesAdapter();
  const filesWatcher = new FilesWatcherAdapter();
  const git = new GitCliAdapter();
  const deskEvents = new DeskEventsAdapter();
  const attachments = options.attachments ?? new FsAttachmentsAdapter();
  const modelsPort = createHarnesysModelsPort(llmProviderRepo, llmModelRepo);
  const runtimeStateRepo = new SqliteRuntimeStateRepo(db);
  const eventBus = createRunEventBus();
  const runEvents = new SqliteRunEventStore(db);
  const runLifecycle = new SqliteRunLifecycleStore(db, runEvents.appendWithinTx.bind(runEvents));
  const runFeed = createRunEventFeed({ events: runEvents, lifecycle: runLifecycle, bus: eventBus });
  const instanceId = env.STUDIO_INSTANCE_ID ?? 'studio-local';
  const toolRegistry = createToolRegistry([...files(), shell(), fetch(), askUser()]);
  const runEngine = createRunEngine({
    lifecycle: runLifecycle,
    events: runEvents,
    feed: runFeed,
    instanceId,
    models: modelsPort,
    toolRegistry,
    toolMessages: 'ordered',
  });
  const targetRef: { current: RunTargets | null } = { current: null };
  const runClaimer = createRunClaimer({
    lifecycle: runLifecycle,
    targets: {
      resolve: (threadId) => targetRef.current?.resolve(threadId) ?? Promise.resolve(null),
    },
    engine: runEngine,
    instanceId,
    sweepMs: 5_000,
  });
  const memory = createStudioMemory(db, {
    runtimeState: runtimeStateRepo,
    providers: llmProviderRepo,
    models: llmModelRepo,
    workspaces: workspaceRepo,
    filesWatcher,
  });
  const workspaceHarnesys =
    options.workspaceHarnesys ??
    new WorkspaceHarnesysRegistry(
      modelsPort,
      { agents: agentRepo, modelRepo: llmModelRepo, providerRepo: llmProviderRepo },
      {
        lifecycle: runLifecycle,
        events: runEvents,
        feed: runFeed,
        claimer: runClaimer,
        instanceId,
      },
    );
  const runTargets = new StudioRunTargets({
    threads: threadRepo,
    agents: agentRepo,
    models: llmModelRepo,
    providers: llmProviderRepo,
    workspaces: workspaceRepo,
    workspaceHarnesys,
    runtimeStates: runtimeStateRepo,
  });
  targetRef.current = runTargets;
  const threadRegistry = new ThreadRuntimeRegistry(runtimeStateRepo);

  const app = new Hono();

  wireControllers({
    app,
    home,
    workspaceRepo,
    agentRepo,
    llmProviderRepo,
    llmModelRepo,
    scheduleRepo,
    webhookRepo,
    threadRepo,
    attachmentRepo,
    workspace,
    workspaceFiles,
    filesWatcher,
    git,
    deskEvents,
    attachments,
    workspaceHarnesys,
    threadRegistry,
    runtimeStateRepo,
    lifecycle: runLifecycle,
    events: runEvents,
    claimer: runClaimer,
    feed: runFeed,
    memory,
    db,
  });

  registerMemoryHttp(app, memory, { agents: agentRepo, workspaces: workspaceRepo });

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
    lifecycle: runLifecycle,
    deskEvents,
    sendThreadRun: undefined as never,
    getThread: undefined as never,
    semanticSessions: memory.semantic,
  });

  wireHostTools({
    db,
    workspaceHarnesys,
    toolRegistry,
    schedules: scheduleRepo,
    webhooks: webhookRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: attachments,
    lifecycle: runLifecycle,
    queue: scheduleQueue,
    deskEvents,
    semanticSessions: memory.semantic,
  });

  app.onError(handleHttpError);
  return app;
}
