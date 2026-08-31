import { join } from 'node:path';
import { Hono } from 'hono';
import { ActiveRunRegistry } from '../adapters/active-runs.adapter.ts';
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
import { SqliteRuntimeStateRepo } from '../adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts';
import { SqliteScheduleRepo } from '../adapters/store/sqlite/repos/sqlite-schedule.repo.ts';
import { SqliteThreadRepo } from '../adapters/store/sqlite/repos/sqlite-thread.repo.ts';
import { SqliteWebhookRepo } from '../adapters/store/sqlite/repos/sqlite-webhook.repo.ts';
import { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import { DB_FILE, defaultHomePath } from '../adapters/store/studio-layout.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import { FilesWatcherAdapter } from '../adapters/workspace/files-watcher.adapter.ts';
import { WorkspaceAdapter } from '../adapters/workspace/workspace.adapter.ts';
import { WorkspaceFilesAdapter } from '../adapters/workspace/workspace-files.adapter.ts';
import { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
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
    options.workspaceHarnesys ??
    new WorkspaceHarnesysRegistry(modelsPort, agentRepo, llmModelRepo, llmProviderRepo);
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
    activeRuns,
    workspace,
    workspaceFiles,
    filesWatcher,
    git,
    deskEvents,
    attachments,
    workspaceHarnesys,
    threadRegistry,
    runtimeStateRepo,
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
    activeRuns,
    deskEvents,
    sendThreadRun: undefined as never,
    getThread: undefined as never,
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

  app.onError(handleHttpError);
  return app;
}
