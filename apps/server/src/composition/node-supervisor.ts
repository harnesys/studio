import { existsSync } from 'node:fs';
import { createHarnesysModelsPort } from '../adapters/harnesys-models-port.ts';
import { startScheduleTicker } from '../adapters/schedule-ticker.adapter.ts';
import { workspaceDbPath } from '../adapters/store/studio-layout.ts';
import type { NodeRegistry } from '../application/nodes/node-registry.ts';
import { FireDueSchedulesUseCase } from '../application/schedules/fire-due-schedules.use-case.ts';
import { FireWebhookUseCase } from '../application/webhooks/fire-webhook.use-case.ts';
import { logger } from '../config/logger.ts';
import type { HostNodeRecord, HostNodeStatus } from '../domain/machine-config.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';
import { NotFoundError, UnavailableError } from '../domain/studio.error.ts';
import { createStudioHost, type StudioHost } from './create-host.ts';
import type { StudioPlatform } from './create-platform.ts';
import { createWorkspaceStore, type StudioStore } from './create-store.ts';
import { createStudioMemory, type StudioMemoryPorts } from './wire-memory.ts';
import { type StudioRuntime, wireRuntime } from './wire-runtime.ts';
export type NodeRuntime = {
  node: HostNodeRecord;
  store: StudioStore;
  runtime: StudioRuntime;
  memory: StudioMemoryPorts;
  host: StudioHost;
  stop: () => void;
};
export type NodeSupervisor = {
  get(id: string): NodeRuntime | undefined;
  list(): NodeRuntime[];
  start(node: HostNodeRecord): NodeRuntime;
  stop(id: string): void;
  require(id: string): NodeRuntime;
  findByThreadId(threadId: string): NodeRuntime | undefined;
  status(id: string): HostNodeStatus;
};
export type NodeSupervisorDeps = {
  platform: StudioPlatform;
  nodes: NodeRegistry;
  secretStore?: SecretStore;
  home: string;
};
export function createNodeSupervisor(deps: NodeSupervisorDeps): NodeSupervisor {
  const runtimes = new Map<string, NodeRuntime>();
  const supervisor: NodeSupervisor = {
    get(id) {
      return runtimes.get(id);
    },
    list() {
      return [...runtimes.values()];
    },
    status(id) {
      return deps.nodes.status(id);
    },
    start(node) {
      const existing = runtimes.get(node.id);
      if (existing) {
        return existing;
      }
      if (deps.nodes.status(node.id) !== 'ready') {
        throw new UnavailableError(`workspace ${node.id} is unavailable`);
      }
      if (!existsSync(workspaceDbPath(node.path))) {
        throw new UnavailableError(
          `workspace.db missing for ${node.id}; run bun run cutover or re-create the node`,
        );
      }
      const store = createWorkspaceStore(node.path, deps.home);
      const modelsPort = createHarnesysModelsPort(store.llmProviderRepo, store.llmModelRepo);
      const runtime = wireRuntime({
        db: store.db,
        threadRepo: store.threadRepo,
        agentRepo: store.agentRepo,
        deskEvents: deps.platform.deskEvents,
        modelsPort,
      });
      const memory = createStudioMemory(store.db, {
        providers: store.llmProviderRepo,
        models: store.llmModelRepo,
        workspaces: store.workspaceRepo,
        filesWatcher: deps.platform.filesWatcher,
      });
      const host = createStudioHost({
        store,
        platform: deps.platform,
        runtime,
        memory,
        options: { secretStore: deps.secretStore },
      });
      const fireDue = new FireDueSchedulesUseCase({
        schedules: store.scheduleRepo,
        threads: store.threadRepo,
        sendThreadRun: host.sendThreadRun,
        lifecycle: runtime.runLifecycle,
        queue: runtime.scheduleQueue,
        deskEvents: deps.platform.deskEvents,
        getThread: runtime.getThread,
      });
      runtime.scheduleQueue.setHandler((scheduleId) => fireDue.fireSchedule(scheduleId));
      const stopScheduleTicker = startScheduleTicker(fireDue);
      const fireWebhook = new FireWebhookUseCase({
        webhooks: store.webhookRepo,
        threads: store.threadRepo,
        sendThreadRun: host.sendThreadRun,
        lifecycle: runtime.runLifecycle,
        queue: runtime.webhookQueue,
        deskEvents: deps.platform.deskEvents,
        getThread: runtime.getThread,
      });
      runtime.webhookQueue.setHandler((webhookId) =>
        fireWebhook.execute({ webhookId }).then(() => undefined),
      );
      const stop = () => {
        stopScheduleTicker();
        memory.knowledgeWatch.stop();
        runtime.stop();
        host.stop();
        runtimes.delete(node.id);
        logger.info({ scope: 'supervisor' }, `stopped node ${node.id}`);
      };
      const entry: NodeRuntime = { node, store, runtime, memory, host, stop };
      runtimes.set(node.id, entry);
      logger.info({ scope: 'supervisor' }, `started node ${node.id} db=${store.dbPath}`);
      return entry;
    },
    stop(id) {
      const entry = runtimes.get(id);
      if (!entry) {
        return;
      }
      entry.stop();
    },
    require(id) {
      const record = deps.nodes.get(id);
      if (!record) {
        throw new NotFoundError('workspace not found');
      }
      if (deps.nodes.status(id) !== 'ready') {
        throw new UnavailableError('workspace unavailable');
      }
      const runtime = runtimes.get(id);
      if (!runtime) {
        throw new UnavailableError('workspace runtime not started');
      }
      return runtime;
    },
    findByThreadId(threadId) {
      for (const entry of runtimes.values()) {
        if (entry.store.threadRepo.findById(threadId)) {
          return entry;
        }
      }
      return undefined;
    },
  };
  return supervisor;
}
