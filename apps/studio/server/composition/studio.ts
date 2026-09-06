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
import { startAskTicker } from '../adapters/ask-ticker.adapter.ts';
import { FsAttachmentsAdapter } from '../adapters/attachments/fs-attachments.adapter.ts';
import { DeskEventsAdapter } from '../adapters/desk-events.adapter.ts';
import { GitCliAdapter } from '../adapters/git/git-cli.adapter.ts';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { type HostToolScope, runInHostToolScope } from '../adapters/host-tool-scope.ts';
import { handleHttpError } from '../adapters/http/http.error.ts';
import type { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
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
import { SqliteUnitOfWork } from '../adapters/store/sqlite/sqlite-unit-of-work.ts';
import { DB_FILE, defaultHomePath } from '../adapters/store/studio-layout.ts';
import { StudioRunTargets } from '../adapters/studio-run-targets.adapter.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
import { GetThreadPlanUseCase } from '../application/plans/get-thread-plan.use-case.ts';
import { notifyIdleIfFree } from '../application/schedules/fire-due-schedules.use-case.ts';
import { GetThreadUseCase } from '../application/threads/get-thread.use-case.ts';
import { createPlanNotesProvider } from '../application/threads/plan-notes.ts';
import { publishDeskThread } from '../application/threads/publish-desk-thread.ts';
import { SendThreadRunUseCase } from '../application/threads/send-thread-run.use-case.ts';
import { env } from '../config/env.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import { wireControllers } from './wire-controllers.ts';
import { wireHostTools } from './wire-host-tools.ts';
import { createStudioMemory, registerMemoryHttp } from './wire-memory.ts';
import { wireSchedules } from './wire-schedules.ts';
import { wireWebhooks } from './wire-webhooks.ts';

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
  const getThread = new GetThreadUseCase(threadRepo, agentRepo, runEvents, runLifecycle);
  const scheduleQueueRef: { current: ScheduleFireQueue | null } = { current: null };
  const webhookQueueRef: { current: ScheduleFireQueue | null } = { current: null };
  const targetRef: { current: RunTargets | null } = { current: null };
  const runClaimer = createRunClaimer({
    lifecycle: runLifecycle,
    targets: {
      resolve: (threadId) => targetRef.current?.resolve(threadId) ?? Promise.resolve(null),
    },
    engine: runEngine,
    instanceId,
    sweepMs: 5_000,
    withScope: (target, execute) => runInHostToolScope(target.scope as HostToolScope, execute),
    onComplete: (record) => {
      publishDeskThread(getThread, deskEvents, record.threadId);
      const queue = scheduleQueueRef.current;
      if (queue !== null) {
        notifyIdleIfFree(runLifecycle, queue, record.threadId);
      }
      const webhookQueue = webhookQueueRef.current;
      if (webhookQueue !== null) {
        notifyIdleIfFree(runLifecycle, webhookQueue, record.threadId);
      }
    },
  });
  startAskTicker({
    lifecycle: runLifecycle,
    kick: runClaimer.kick,
    onCancelled: (threadId) => publishDeskThread(getThread, deskEvents, threadId),
  });
  const memory = createStudioMemory(db, {
    runtimeState: runtimeStateRepo,
    providers: llmProviderRepo,
    models: llmModelRepo,
    workspaces: workspaceRepo,
    filesWatcher,
  });
  const planUow = new SqliteUnitOfWork(db);
  const getThreadPlan = new GetThreadPlanUseCase(planUow);
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
      [createPlanNotesProvider({ getThreadPlan })],
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

  const sendThreadRun = new SendThreadRunUseCase({
    threads: threadRepo,
    agents: agentRepo,
    models: llmModelRepo,
    providers: llmProviderRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    workspaceHarnesys,
    registry: threadRegistry,
    deskEvents,
    getThread,
  });

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
    getThread,
    getThreadPlan,
    sendThreadRun,
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
    sendThreadRun,
    getThread,
    semanticSessions: memory.semantic,
  });
  scheduleQueueRef.current = scheduleQueue;

  const webhookQueue = wireWebhooks({
    app,
    db,
    webhooks: webhookRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: attachments,
    lifecycle: runLifecycle,
    deskEvents,
    sendThreadRun,
    getThread,
  });
  webhookQueueRef.current = webhookQueue;

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
    getThread,
    semanticSessions: memory.semantic,
    memory,
  });

  app.onError(handleHttpError);
  return app;
}
