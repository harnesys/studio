import { Hono } from 'hono';
import { handleHttpError } from '../adapters/http/http.error.ts';
import type { StudioHost } from './create-host.ts';
import type { StudioPlatform } from './create-platform.ts';
import type { StudioStore } from './create-store.ts';
import { wireControllers } from './wire-controllers.ts';
import { registerMemoryHttp, type StudioMemoryPorts } from './wire-memory.ts';
import type { StudioRuntime } from './wire-runtime.ts';
import { wireSchedules } from './wire-schedules.ts';
import { wireWebhooks } from './wire-webhooks.ts';

export function registerStudioHttp(args: {
  store: StudioStore;
  platform: StudioPlatform;
  runtime: StudioRuntime;
  memory: StudioMemoryPorts;
  host: StudioHost;
}): Hono {
  const { store, platform, runtime, memory, host } = args;
  const app = new Hono();

  wireControllers({
    app,
    home: store.home,
    nodeRegistry: store.nodeRegistry,
    workspaceRepo: store.workspaceRepo,
    agentRepo: store.agentRepo,
    llmProviderRepo: store.llmProviderRepo,
    llmModelRepo: store.llmModelRepo,
    modePresetRepo: store.modePresetRepo,
    scheduleRepo: store.scheduleRepo,
    webhookRepo: store.webhookRepo,
    threadRepo: store.threadRepo,
    attachmentRepo: store.attachmentRepo,
    pluginRepo: store.pluginRepo,
    pluginRegistryRepo: store.pluginRegistryRepo,
    workspace: platform.workspace,
    workspaceFiles: platform.workspaceFiles,
    filesWatcher: platform.filesWatcher,
    git: platform.git,
    deskEvents: platform.deskEvents,
    attachments: platform.attachments,
    workspaceHarnesys: host.workspaceHarnesys,
    lsp: host.lsp,
    secretStore: host.secretStore,
    threadRegistry: host.threadRegistry,
    threadRunHooks: host.threadRunHooks,
    runtimeStateRepo: host.runtimeStateRepo,
    lifecycle: runtime.runLifecycle,
    events: runtime.runEvents,
    claimer: runtime.runClaimer,
    feed: runtime.runFeed,
    memory,
    db: store.db,
    modelsPort: platform.modelsPort,
    getThread: runtime.getThread,
    getThreadPlan: host.getThreadPlan,
    sendThreadRun: host.sendThreadRun,
  });

  registerMemoryHttp(app, memory, {
    agents: store.agentRepo,
    workspaces: store.workspaceRepo,
  });

  wireSchedules({
    app,
    db: store.db,
    startTicker: !store.externalDb,
    schedules: store.scheduleRepo,
    threads: store.threadRepo,
    agents: store.agentRepo,
    workspaces: store.workspaceRepo,
    attachments: store.attachmentRepo,
    attachmentsFs: platform.attachments,
    lifecycle: runtime.runLifecycle,
    deskEvents: platform.deskEvents,
    sendThreadRun: host.sendThreadRun,
    getThread: runtime.getThread,
    semanticSessions: memory.semantic,
    queue: runtime.scheduleQueue,
  });

  wireWebhooks({
    app,
    db: store.db,
    webhooks: store.webhookRepo,
    threads: store.threadRepo,
    agents: store.agentRepo,
    workspaces: store.workspaceRepo,
    attachments: store.attachmentRepo,
    attachmentsFs: platform.attachments,
    lifecycle: runtime.runLifecycle,
    deskEvents: platform.deskEvents,
    sendThreadRun: host.sendThreadRun,
    getThread: runtime.getThread,
    queue: runtime.webhookQueue,
  });

  app.onError(handleHttpError);
  return app;
}
