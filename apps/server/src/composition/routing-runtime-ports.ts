import type {
  AgentDefinition,
  AgentRosterEntry,
  PackRegistration,
  RunClaimer,
  RunEventFeed,
  RunEventStore,
  RunLifecycleStore,
  RuntimeHandle,
  SkillRegistry,
} from 'harnesys';
import type { KnowledgeIndexEventsAdapter } from '../adapters/memory/knowledge-index-events.adapter.ts';
import type { KnowledgeWatchBridge } from '../adapters/memory/knowledge-watch.ts';
import type {
  LoadedWorkspacePlugin,
  WorkspaceHarnesysRegistry,
} from '../adapters/workspace-harnesys.registry.ts';
import type { PluginAgentCatalog } from '../application/plugins/plugin-agents.ts';
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
import { NotFoundError } from '../domain/studio.error.ts';
import type { Workspace } from '../domain/workspace.port.ts';
import type { NodeRuntime, NodeSupervisor } from './node-supervisor.ts';
import { nodeForThread, requireNode } from './routing-helpers.ts';
import type { StudioMemoryPorts } from './wire-memory.ts';
export function createRoutingLifecycle(supervisor: NodeSupervisor): RunLifecycleStore {
  const resolveByRun = async (runId: string): Promise<NodeRuntime> => {
    for (const entry of supervisor.list()) {
      const rec = await entry.runtime.runLifecycle.get(runId);
      if (rec) {
        return entry;
      }
    }
    throw new NotFoundError('run not found');
  };
  return {
    create: (run, events) => {
      const node = nodeForThread(supervisor, run.threadId);
      return node.runtime.runLifecycle.create(run, events);
    },
    get: async (runId) => {
      for (const entry of supervisor.list()) {
        const rec = await entry.runtime.runLifecycle.get(runId);
        if (rec) {
          return rec;
        }
      }
      return null;
    },
    activeByThread: (threadId) =>
      nodeForThread(supervisor, threadId).runtime.runLifecycle.activeByThread(threadId),
    childrenByParent: async (parentRunId) => {
      const node = await resolveByRun(parentRunId);
      return node.runtime.runLifecycle.childrenByParent(parentRunId);
    },
    claim: async (runId, instanceId, ttlMs) => {
      const node = await resolveByRun(runId);
      return node.runtime.runLifecycle.claim(runId, instanceId, ttlMs);
    },
    transition: async (runId, expectedEpoch, patch) => {
      const node = await resolveByRun(runId);
      return node.runtime.runLifecycle.transition(runId, expectedEpoch, patch);
    },
    renewLease: async (runId, instanceId, ttlMs) => {
      const node = await resolveByRun(runId);
      return node.runtime.runLifecycle.renewLease(runId, instanceId, ttlMs);
    },
    listClaimable: async () => [],
    listExpiredAsks: async () => [],
    listDueTimers: async () => [],
  };
}
async function nodeForRun(supervisor: NodeSupervisor, runId: string): Promise<NodeRuntime> {
  for (const entry of supervisor.list()) {
    if (
      (await entry.runtime.runLifecycle.get(runId)) ||
      (await entry.runtime.runEvents.hasRun(runId))
    ) {
      return entry;
    }
  }
  throw new NotFoundError('run not found');
}
export function createRoutingRunEvents(supervisor: NodeSupervisor): RunEventStore {
  return {
    next: (runId) => {
      for (const entry of supervisor.list()) {
        if (entry.store.threadRepo.listByWorkspace(entry.node.id).length >= 0) {
          return entry.runtime.runEvents.next(runId);
        }
      }
      throw new NotFoundError('no workspace runtime');
    },
    append: async (runId, expectedEpoch, events) => {
      const node = await nodeForRun(supervisor, runId);
      return node.runtime.runEvents.append(runId, expectedEpoch, events);
    },
    tail: async (runId, fromSeq) => {
      const node = await nodeForRun(supervisor, runId);
      return node.runtime.runEvents.tail(runId, fromSeq);
    },
    latestSeq: async (runId) => {
      const node = await nodeForRun(supervisor, runId);
      return node.runtime.runEvents.latestSeq(runId);
    },
    listByThread: async (threadId) =>
      nodeForThread(supervisor, threadId).runtime.runEvents.listByThread(threadId),
    hasRun: async (runId) => {
      for (const entry of supervisor.list()) {
        if (await entry.runtime.runEvents.hasRun(runId)) {
          return true;
        }
      }
      return false;
    },
    appendForThread: (threadId, runId, events) =>
      nodeForThread(supervisor, threadId).runtime.runEvents.appendForThread(
        threadId,
        runId,
        events,
      ),
  };
}
export function createRoutingFeed(supervisor: NodeSupervisor): RunEventFeed {
  return {
    subscribe: (runId, fromSeq) => {
      const iterator = (async function* () {
        const node = await nodeForRun(supervisor, runId);
        yield* node.runtime.runFeed.subscribe(runId, fromSeq);
      })();
      return iterator;
    },
    publish: (runId, events) => {
      void nodeForRun(supervisor, runId).then((node) => {
        node.runtime.runFeed.publish(runId, events);
      });
    },
  };
}
export function createRoutingClaimer(supervisor: NodeSupervisor): RunClaimer {
  return {
    kick: () => {
      for (const entry of supervisor.list()) {
        entry.runtime.runClaimer.kick();
      }
    },
    stop: () => {
      for (const entry of supervisor.list()) {
        entry.runtime.runClaimer.stop();
      }
    },
  };
}
export function createRoutingRuntimeStateRepo(supervisor: NodeSupervisor): RuntimeStateRepository {
  return {
    forState: (threadId) =>
      nodeForThread(supervisor, threadId).host.runtimeStateRepo.forState(threadId),
  };
}
export function createRoutingWorkspaceHarnesys(
  supervisor: NodeSupervisor,
): WorkspaceHarnesysRegistry {
  const api = {
    get: (workspace: Workspace): Promise<RuntimeHandle> =>
      requireNode(supervisor, workspace.id).host.workspaceHarnesys.get(workspace),
    invalidate: (workspaceId: string) =>
      requireNode(supervisor, workspaceId).host.workspaceHarnesys.invalidate(workspaceId),
    forget: (workspaceId: string) =>
      requireNode(supervisor, workspaceId).host.workspaceHarnesys.forget(workspaceId),
    evictIrFor: (prefix: string): void => {
      for (const entry of supervisor.list()) {
        entry.host.workspaceHarnesys.evictIrFor(prefix);
      }
    },
    loadEnabledPlugins: (workspaceId: string): Promise<LoadedWorkspacePlugin[]> =>
      requireNode(supervisor, workspaceId).host.workspaceHarnesys.loadEnabledPlugins(workspaceId),
    pluginAgents: (workspaceId: string): Promise<PluginAgentCatalog> =>
      requireNode(supervisor, workspaceId).host.workspaceHarnesys.pluginAgents(workspaceId),
    skillsFor: (workspaceId: string): SkillRegistry | undefined =>
      supervisor.get(workspaceId)?.host.workspaceHarnesys.skillsFor(workspaceId),
    effectiveRegistrations: (workspace: Workspace): PackRegistration[] =>
      requireNode(supervisor, workspace.id).host.workspaceHarnesys.effectiveRegistrations(
        workspace,
      ),
    resolveAgentDefinition: (id: string): AgentDefinition | undefined => {
      for (const entry of supervisor.list()) {
        const def = entry.host.workspaceHarnesys.resolveAgentDefinition(id);
        if (def) {
          return def;
        }
      }
      return undefined;
    },
    resolveAgentForRun: (id: string, parent?: AgentDefinition): AgentDefinition | undefined => {
      for (const entry of supervisor.list()) {
        const def = entry.host.workspaceHarnesys.resolveAgentForRun(id, parent);
        if (def) {
          return def;
        }
      }
      return undefined;
    },
    listScopedRoster: (parent?: AgentDefinition): AgentRosterEntry[] => {
      if (!parent) {
        return [];
      }
      for (const entry of supervisor.list()) {
        const roster = entry.host.workspaceHarnesys.listScopedRoster(parent);
        if (roster.length > 0) {
          return roster;
        }
      }
      return [];
    },
  };
  return api as WorkspaceHarnesysRegistry;
}
function scopeWorkspaceId(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object' && 'workspaceId' in arg) {
    return String(
      (
        arg as {
          workspaceId: string;
        }
      ).workspaceId,
    );
  }
  throw new NotFoundError('workspace scope missing');
}
function memoryPortProxy<T extends object>(
  supervisor: NodeSupervisor,
  pick: (memory: StudioMemoryPorts) => T,
): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      return (...args: unknown[]) => {
        const workspaceId = scopeWorkspaceId(args[0]);
        const port = pick(requireNode(supervisor, workspaceId).memory) as Record<
          string | symbol,
          (...a: unknown[]) => unknown
        >;
        const method = port[prop];
        if (typeof method !== 'function') {
          return method;
        }
        return method.apply(port, args);
      };
    },
  });
}
export function createRoutingMemory(supervisor: NodeSupervisor): StudioMemoryPorts {
  return {
    pin: memoryPortProxy(supervisor, (m) => m.pin),
    semantic: memoryPortProxy(supervisor, (m) => m.semantic),
    episodic: memoryPortProxy(supervisor, (m) => m.episodic),
    knowledge: memoryPortProxy(supervisor, (m) => m.knowledge),
    knowledgeIndexer: memoryPortProxy(supervisor, (m) => m.knowledgeIndexer),
    knowledgeWatch: {
      start: () => {
        for (const entry of supervisor.list()) {
          entry.memory.knowledgeWatch.start();
        }
      },
      stop: () => {
        for (const entry of supervisor.list()) {
          entry.memory.knowledgeWatch.stop();
        }
      },
      syncWatch: (workspaceId: string, watchEnabled: boolean) =>
        requireNode(supervisor, workspaceId).memory.knowledgeWatch.syncWatch(
          workspaceId,
          watchEnabled,
        ),
    } as KnowledgeWatchBridge,
    knowledgeIndexEvents: {
      subscribe: (workspaceId: string, listener: never) =>
        requireNode(supervisor, workspaceId).memory.knowledgeIndexEvents.subscribe(
          workspaceId,
          listener,
        ),
    } as KnowledgeIndexEventsAdapter,
    get embeddings() {
      const entry = supervisor.list()[0];
      if (!entry) {
        throw new NotFoundError('no workspace runtime');
      }
      return entry.memory.embeddings;
    },
  };
}
