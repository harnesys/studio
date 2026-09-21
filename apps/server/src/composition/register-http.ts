import type { ModelsPort, RuntimeHandle } from 'harnesys';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { requireHostToken } from '../adapters/http/auth.middleware.ts';
import { HealthController } from '../adapters/http/health.controller.ts';
import { HostNetworkController } from '../adapters/http/host/host-network.controller.ts';
import { handleHttpError } from '../adapters/http/http.error.ts';
import { MetaController } from '../adapters/http/meta.controller.ts';
import { PairingController } from '../adapters/http/pairing/pairing.controller.ts';
import type { StudioLspAdapter } from '../adapters/lsp/studio-lsp.adapter.ts';
import { ScheduleFireQueue } from '../adapters/schedule-fire-queue.adapter.ts';
import { ThreadRuntimeRegistry } from '../adapters/thread-runtime.registry.ts';
import type { NodeRegistry } from '../application/nodes/node-registry.ts';
import type { GetThreadPlanInput } from '../application/plans/get-thread-plan.use-case.ts';
import type { ThreadRunHooks } from '../application/threads/compact-thread.use-case.ts';
import type { GetThreadInput } from '../application/threads/get-thread.use-case.ts';
import type { SendThreadRunInput } from '../application/threads/send-thread-run.use-case.ts';
import type { MachineConfigPort } from '../domain/machine-config.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';
import { NotFoundError } from '../domain/studio.error.ts';
import type { StudioPlatform } from './create-platform.ts';
import type { NodeSupervisor } from './node-supervisor.ts';
import {
  createRoutingAgentRepo,
  createRoutingAttachmentRepo,
  createRoutingClaimer,
  createRoutingFeed,
  createRoutingLifecycle,
  createRoutingMemory,
  createRoutingModelRepo,
  createRoutingModePresetRepo,
  createRoutingPluginRegistryRepo,
  createRoutingPluginRepo,
  createRoutingProviderRepo,
  createRoutingRunEvents,
  createRoutingRuntimeStateRepo,
  createRoutingScheduleRepo,
  createRoutingThreadRepo,
  createRoutingWebhookRepo,
  createRoutingWorkspaceHarnesys,
  createRoutingWorkspaceRepo,
} from './routing-repos.ts';
import { tryCreateHostSecretStore } from './secret-store-boot.ts';
import { wireControllers } from './wire-controllers.ts';
import { registerMemoryHttp } from './wire-memory.ts';
import { wireSchedules } from './wire-schedules.ts';
import { wireWebhooks } from './wire-webhooks.ts';
export type RegisterStudioHttpArgs = {
  supervisor: NodeSupervisor;
  platform: StudioPlatform;
  machineConfig: MachineConfigPort;
  nodeRegistry: NodeRegistry;
  home: string;
  secretStore?: SecretStore;
};
export function registerStudioHttp(args: RegisterStudioHttpArgs): Hono {
  const { supervisor, platform, machineConfig, nodeRegistry, home } = args;
  const app = new Hono();
  const hostToken = machineConfig.read().host.token;
  app.use(
    '*',
    cors({
      origin: (origin) => origin || '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
      exposeHeaders: ['Content-Type'],
      maxAge: 86400,
    }),
  );
  new HealthController().register(app);
  app.use('*', requireHostToken(hostToken));
  new PairingController({ machineConfig }).register(app);
  new MetaController().register(app);
  new HostNetworkController().register(app);
  const workspaceRepo = createRoutingWorkspaceRepo(supervisor);
  const agentRepo = createRoutingAgentRepo(supervisor);
  const threadRepo = createRoutingThreadRepo(supervisor);
  const scheduleRepo = createRoutingScheduleRepo(supervisor);
  const webhookRepo = createRoutingWebhookRepo(supervisor);
  const llmProviderRepo = createRoutingProviderRepo(supervisor);
  const llmModelRepo = createRoutingModelRepo(supervisor);
  const modePresetRepo = createRoutingModePresetRepo(supervisor);
  const pluginRepo = createRoutingPluginRepo(supervisor);
  const pluginRegistryRepo = createRoutingPluginRegistryRepo(supervisor);
  const attachmentRepo = createRoutingAttachmentRepo(supervisor);
  const lifecycle = createRoutingLifecycle(supervisor);
  const events = createRoutingRunEvents(supervisor);
  const feed = createRoutingFeed(supervisor);
  const claimer = createRoutingClaimer(supervisor);
  const memory = createRoutingMemory(supervisor);
  const workspaceHarnesys = createRoutingWorkspaceHarnesys(supervisor);
  const runtimeStateRepo = createRoutingRuntimeStateRepo(supervisor);
  const modelsPort: ModelsPort = createHarnesysModelsPort(llmProviderRepo, llmModelRepo);
  const getThread: GetThreadInput = {
    execute: (request) => {
      const node = supervisor.findByThreadId(request.id);
      if (!node) {
        throw new NotFoundError('thread not found');
      }
      return node.runtime.getThread.execute(request);
    },
  };
  const sendThreadRun: SendThreadRunInput = {
    execute: (request) => {
      const node = supervisor.findByThreadId(request.threadId);
      if (!node) {
        throw new NotFoundError('thread not found');
      }
      return node.host.sendThreadRun.execute(request);
    },
  };
  const getThreadPlan: GetThreadPlanInput = {
    execute: (request) => {
      const node = supervisor.findByThreadId(request.threadId);
      if (!node) {
        throw new NotFoundError('thread not found');
      }
      return node.host.getThreadPlan.execute(request);
    },
  };
  const threadRunHooks: ThreadRunHooks = {
    ensure: (threadId) => {
      const node = supervisor.findByThreadId(threadId);
      if (!node) {
        throw new NotFoundError('thread not found');
      }
      return node.host.threadRunHooks.ensure(threadId);
    },
    release: (threadId) => {
      const node = supervisor.findByThreadId(threadId);
      if (!node) {
        return Promise.resolve();
      }
      return node.host.threadRunHooks.release(threadId);
    },
  };
  const threadRegistry = new RoutingThreadRegistry(supervisor);
  const secretStore = args.secretStore ?? tryCreateHostSecretStore();
  const lsp = createRoutingLsp(supervisor);
  wireControllers({
    app,
    home,
    machineConfig,
    nodeRegistry,
    workspaceRepo: workspaceRepo as never,
    agentRepo: agentRepo as never,
    llmProviderRepo: llmProviderRepo as never,
    llmModelRepo: llmModelRepo as never,
    modePresetRepo: modePresetRepo as never,
    scheduleRepo: scheduleRepo as never,
    webhookRepo: webhookRepo as never,
    threadRepo: threadRepo as never,
    attachmentRepo: attachmentRepo as never,
    pluginRepo: pluginRepo as never,
    pluginRegistryRepo: pluginRegistryRepo as never,
    workspace: platform.workspace,
    workspaceFiles: platform.workspaceFiles,
    filesWatcher: platform.filesWatcher,
    git: platform.git,
    deskEvents: platform.deskEvents,
    attachments: platform.attachments,
    workspaceHarnesys,
    lsp,
    secretStore,
    threadRegistry,
    threadRunHooks,
    runtimeStateRepo: runtimeStateRepo as never,
    lifecycle,
    events: events as never,
    claimer,
    feed,
    memory,
    db: undefined as never,
    modelsPort,
    getThread,
    getThreadPlan,
    sendThreadRun,
    supervisor,
  });
  registerMemoryHttp(app, memory, {
    agents: agentRepo,
    workspaces: workspaceRepo,
  });
  wireSchedules({
    app,
    db: undefined,
    startTicker: false,
    schedules: scheduleRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: platform.attachments,
    lifecycle,
    deskEvents: platform.deskEvents,
    sendThreadRun,
    getThread,
    semanticSessions: memory.semantic,
    queue: routingScheduleQueue(supervisor, 'schedule'),
  });
  wireWebhooks({
    app,
    db: undefined as never,
    webhooks: webhookRepo,
    threads: threadRepo,
    agents: agentRepo,
    workspaces: workspaceRepo,
    attachments: attachmentRepo,
    attachmentsFs: platform.attachments,
    lifecycle,
    deskEvents: platform.deskEvents,
    sendThreadRun,
    getThread,
    queue: routingScheduleQueue(supervisor, 'webhook'),
    machineConfig,
  });
  app.onError(handleHttpError);
  return app;
}
function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\/$/, '') === b.replace(/\/$/, '');
}
function routingScheduleQueue(
  supervisor: NodeSupervisor,
  kind: 'schedule' | 'webhook',
): ScheduleFireQueue {
  const queue = new ScheduleFireQueue();
  queue.setHandler(async () => undefined);
  queue.enqueue = (threadId: string, itemId: string) => {
    const node = supervisor.findByThreadId(threadId);
    if (!node) {
      return;
    }
    const target = kind === 'schedule' ? node.runtime.scheduleQueue : node.runtime.webhookQueue;
    target.enqueue(threadId, itemId);
  };
  queue.drop = (threadId: string) => {
    const node = supervisor.findByThreadId(threadId);
    if (!node) {
      return;
    }
    const target = kind === 'schedule' ? node.runtime.scheduleQueue : node.runtime.webhookQueue;
    target.drop(threadId);
  };
  queue.onThreadIdle = (threadId: string) => {
    const node = supervisor.findByThreadId(threadId);
    if (!node) {
      return;
    }
    const target = kind === 'schedule' ? node.runtime.scheduleQueue : node.runtime.webhookQueue;
    target.onThreadIdle(threadId);
  };
  return queue;
}
class RoutingThreadRegistry extends ThreadRuntimeRegistry {
  constructor(private readonly supervisor: NodeSupervisor) {
    super({
      forState: () => {
        throw new NotFoundError('routing registry does not own state');
      },
    });
  }
  override threadOf(threadId: string, runtime: RuntimeHandle, agentId: string, cwd?: string) {
    const node = this.supervisor.findByThreadId(threadId);
    if (!node) {
      throw new NotFoundError('thread not found');
    }
    return node.host.threadRegistry.threadOf(threadId, runtime, agentId, cwd);
  }
  override forget(threadId: string): void {
    this.supervisor.findByThreadId(threadId)?.host.threadRegistry.forget(threadId);
  }
}
function createRoutingLsp(supervisor: NodeSupervisor): StudioLspAdapter {
  return new Proxy({} as StudioLspAdapter, {
    get(_target, prop) {
      return (...args: unknown[]) => {
        const cwd = typeof args[0] === 'string' ? args[0] : undefined;
        const node =
          cwd !== undefined
            ? supervisor.list().find((entry) => pathsEqual(entry.node.path, cwd))
            : supervisor.list()[0];
        if (!node) {
          if (prop === 'hasServerFor') {
            return Promise.resolve(false);
          }
          throw new NotFoundError('workspace not found');
        }
        const value = Reflect.get(node.host.lsp, prop, node.host.lsp);
        if (typeof value !== 'function') {
          return value;
        }
        return value.apply(node.host.lsp, args);
      };
    },
  });
}
