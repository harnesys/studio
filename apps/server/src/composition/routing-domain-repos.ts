import type { AgentInsert, AgentPatch, AgentRepository } from '../domain/agent.port.ts';
import type { AttachmentRepository } from '../domain/attachment.port.ts';
import type {
  LlmModelInsert,
  LlmModelPatch,
  LlmModelRepository,
  LlmProviderInsert,
  LlmProviderPatch,
  LlmProviderRepository,
} from '../domain/llm-provider.port.ts';
import type { ModePresetRepository } from '../domain/mode-preset.port.ts';
import type { PluginRepository } from '../domain/plugin.port.ts';
import type { PluginRegistryRepository } from '../domain/plugin-registry.port.ts';
import type { ScheduleRepository } from '../domain/schedule.port.ts';
import { NotFoundError } from '../domain/studio.error.ts';
import type { ThreadInsert, ThreadPatch, ThreadRepository } from '../domain/thread.port.ts';
import type { WebhookRepository } from '../domain/webhook.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';
import type { NodeSupervisor } from './node-supervisor.ts';
import { nodeForAgent, nodeForThread, requireNode, scan } from './routing-helpers.ts';

export function createRoutingWorkspaceRepo(supervisor: NodeSupervisor): WorkspaceRepository {
  return {
    list: () => supervisor.list().flatMap((entry) => entry.store.workspaceRepo.list()),
    findById: (id) => supervisor.get(id)?.store.workspaceRepo.findById(id),
    insert: (rec) => requireNode(supervisor, rec.id).store.workspaceRepo.insert(rec),
    update: (id, patch) => requireNode(supervisor, id).store.workspaceRepo.update(id, patch),
    delete: (id) => {
      supervisor.get(id)?.store.workspaceRepo.delete(id);
    },
  };
}

export function createRoutingAgentRepo(supervisor: NodeSupervisor): AgentRepository {
  return {
    listAll: () => supervisor.list().flatMap((e) => e.store.agentRepo.listAll()),
    listByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.agentRepo.listByWorkspace(workspaceId),
    findById: (id) => scan(supervisor, (e) => e.store.agentRepo.findById(id)),
    findByName: (workspaceId, name) =>
      requireNode(supervisor, workspaceId).store.agentRepo.findByName(workspaceId, name),
    insert: (rec: AgentInsert) =>
      requireNode(supervisor, rec.workspaceId).store.agentRepo.insert(rec),
    update: (id, patch: AgentPatch) =>
      nodeForAgent(supervisor, id).store.agentRepo.update(id, patch),
    delete: (id) => nodeForAgent(supervisor, id).store.agentRepo.delete(id),
    deleteByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.agentRepo.deleteByWorkspace(workspaceId),
  };
}

export function createRoutingThreadRepo(supervisor: NodeSupervisor): ThreadRepository {
  return {
    listByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.threadRepo.listByWorkspace(workspaceId),
    findById: (id) => scan(supervisor, (e) => e.store.threadRepo.findById(id)),
    insert: (rec: ThreadInsert) =>
      requireNode(supervisor, rec.workspaceId).store.threadRepo.insert(rec),
    patch: (id, patch: ThreadPatch) =>
      nodeForThread(supervisor, id).store.threadRepo.patch(id, patch),
    updateTitle: (id, title) =>
      nodeForThread(supervisor, id).store.threadRepo.updateTitle(id, title),
    setRunMode: (id, mode) => nodeForThread(supervisor, id).store.threadRepo.setRunMode(id, mode),
    setPinned: (id, pinned) => nodeForThread(supervisor, id).store.threadRepo.setPinned(id, pinned),
    markRead: (id) => nodeForThread(supervisor, id).store.threadRepo.markRead(id),
    touch: (id) => nodeForThread(supervisor, id).store.threadRepo.touch(id),
    delete: (id) => nodeForThread(supervisor, id).store.threadRepo.delete(id),
    deleteByAgent: (agentId) => {
      const node = scan(supervisor, (e) => (e.store.agentRepo.findById(agentId) ? e : undefined));
      node?.store.threadRepo.deleteByAgent(agentId);
    },
    deleteByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.threadRepo.deleteByWorkspace(workspaceId),
  };
}

export function createRoutingScheduleRepo(supervisor: NodeSupervisor): ScheduleRepository {
  return {
    listByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.scheduleRepo.listByWorkspace(workspaceId),
    listByTargetAgent: (workspaceId, agentId) =>
      requireNode(supervisor, workspaceId).store.scheduleRepo.listByTargetAgent(
        workspaceId,
        agentId,
      ),
    listDue: (nowIso) => supervisor.list().flatMap((e) => e.store.scheduleRepo.listDue(nowIso)),
    findById: (id) => scan(supervisor, (e) => e.store.scheduleRepo.findById(id)),
    findByThreadId: (threadId) =>
      scan(supervisor, (e) => e.store.scheduleRepo.findByThreadId(threadId)),
    insert: (rec) => requireNode(supervisor, rec.workspaceId).store.scheduleRepo.insert(rec),
    update: (id, patch) => {
      const row = scan(supervisor, (e) => e.store.scheduleRepo.findById(id));
      if (!row) {
        throw new NotFoundError('schedule not found');
      }
      return requireNode(supervisor, row.workspaceId).store.scheduleRepo.update(id, patch);
    },
    delete: (id) => {
      const row = scan(supervisor, (e) => e.store.scheduleRepo.findById(id));
      if (row) {
        requireNode(supervisor, row.workspaceId).store.scheduleRepo.delete(id);
      }
    },
    deleteByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.scheduleRepo.deleteByWorkspace(workspaceId),
  };
}

export function createRoutingWebhookRepo(supervisor: NodeSupervisor): WebhookRepository {
  return {
    listByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.webhookRepo.listByWorkspace(workspaceId),
    listByTargetAgent: (workspaceId, agentId) =>
      requireNode(supervisor, workspaceId).store.webhookRepo.listByTargetAgent(
        workspaceId,
        agentId,
      ),
    findById: (id) => scan(supervisor, (e) => e.store.webhookRepo.findById(id)),
    findByThreadId: (threadId) =>
      scan(supervisor, (e) => e.store.webhookRepo.findByThreadId(threadId)),
    insert: (rec) => requireNode(supervisor, rec.workspaceId).store.webhookRepo.insert(rec),
    update: (id, patch) => {
      const row = scan(supervisor, (e) => e.store.webhookRepo.findById(id));
      if (!row) {
        throw new NotFoundError('webhook not found');
      }
      return requireNode(supervisor, row.workspaceId).store.webhookRepo.update(id, patch);
    },
    delete: (id) => {
      const row = scan(supervisor, (e) => e.store.webhookRepo.findById(id));
      if (row) {
        requireNode(supervisor, row.workspaceId).store.webhookRepo.delete(id);
      }
    },
    deleteByWorkspace: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.webhookRepo.deleteByWorkspace(workspaceId),
  };
}

export function createRoutingProviderRepo(supervisor: NodeSupervisor): LlmProviderRepository {
  return {
    list: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.llmProviderRepo.list(workspaceId),
    findById: (workspaceId, id) =>
      requireNode(supervisor, workspaceId).store.llmProviderRepo.findById(workspaceId, id),
    findByName: (workspaceId, name) =>
      requireNode(supervisor, workspaceId).store.llmProviderRepo.findByName(workspaceId, name),
    insert: (rec: LlmProviderInsert) =>
      requireNode(supervisor, rec.workspaceId).store.llmProviderRepo.insert(rec),
    update: (workspaceId, id, patch: LlmProviderPatch) =>
      requireNode(supervisor, workspaceId).store.llmProviderRepo.update(workspaceId, id, patch),
    delete: (workspaceId, id) =>
      requireNode(supervisor, workspaceId).store.llmProviderRepo.delete(workspaceId, id),
  };
}

export function createRoutingModelRepo(supervisor: NodeSupervisor): LlmModelRepository {
  return {
    listByProvider: (providerId) => {
      for (const entry of supervisor.list()) {
        const models = entry.store.llmModelRepo.listByProvider(providerId);
        if (models.length > 0) {
          return models;
        }
      }
      return [];
    },
    findById: (id) => scan(supervisor, (e) => e.store.llmModelRepo.findById(id)),
    findByProviderAndName: (providerId, name) =>
      scan(supervisor, (e) => e.store.llmModelRepo.findByProviderAndName(providerId, name)),
    insert: (rec: LlmModelInsert) => {
      for (const entry of supervisor.list()) {
        for (const provider of entry.store.llmProviderRepo.list(entry.node.id)) {
          if (provider.id === rec.providerId) {
            return entry.store.llmModelRepo.insert(rec);
          }
        }
      }
      throw new NotFoundError('provider not found');
    },
    update: (id, patch: LlmModelPatch) => {
      for (const entry of supervisor.list()) {
        if (entry.store.llmModelRepo.findById(id)) {
          return entry.store.llmModelRepo.update(id, patch);
        }
      }
      throw new NotFoundError('model not found');
    },
    delete: (id) => {
      for (const entry of supervisor.list()) {
        if (entry.store.llmModelRepo.findById(id)) {
          entry.store.llmModelRepo.delete(id);
          return;
        }
      }
    },
  };
}

export function createRoutingModePresetRepo(supervisor: NodeSupervisor): ModePresetRepository {
  return {
    list: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.modePresetRepo.list(workspaceId),
    findById: (workspaceId, id) =>
      requireNode(supervisor, workspaceId).store.modePresetRepo.findById(workspaceId, id),
    insert: (rec) => requireNode(supervisor, rec.workspaceId).store.modePresetRepo.insert(rec),
    update: (workspaceId, id, patch) =>
      requireNode(supervisor, workspaceId).store.modePresetRepo.update(workspaceId, id, patch),
    delete: (workspaceId, id) =>
      requireNode(supervisor, workspaceId).store.modePresetRepo.delete(workspaceId, id),
  };
}

export function createRoutingPluginRepo(supervisor: NodeSupervisor): PluginRepository {
  return {
    list: (workspaceId) => requireNode(supervisor, workspaceId).store.pluginRepo.list(workspaceId),
    listAll: () => supervisor.list().flatMap((e) => e.store.pluginRepo.listAll()),
    findByName: (workspaceId, name) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.findByName(workspaceId, name),
    findByNameAny: (name) => scan(supervisor, (e) => e.store.pluginRepo.findByNameAny(name)),
    upsert: (rec) => requireNode(supervisor, rec.workspaceId).store.pluginRepo.upsert(rec),
    delete: (workspaceId, name) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.delete(workspaceId, name),
    setGrants: (workspaceId, name, grants) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.setGrants(workspaceId, name, grants),
    setOption: (workspaceId, name, key, value) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.setOption(
        workspaceId,
        name,
        key,
        value,
      ),
    approveServer: (workspaceId, name, serverId) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.approveServer(
        workspaceId,
        name,
        serverId,
      ),
    approvals: (workspaceId, name) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.approvals(workspaceId, name),
    setServerDisabled: (name, serverId, workspaceId, disabled) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.setServerDisabled(
        name,
        serverId,
        workspaceId,
        disabled,
      ),
    isServerDisabled: (name, serverId, workspaceId) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.isServerDisabled(
        name,
        serverId,
        workspaceId,
      ),
    listDisabledServers: (workspaceId) =>
      requireNode(supervisor, workspaceId).store.pluginRepo.listDisabledServers(workspaceId),
  };
}

export function createRoutingPluginRegistryRepo(
  supervisor: NodeSupervisor,
): PluginRegistryRepository {
  return {
    list: () => supervisor.list()[0]?.store.pluginRegistryRepo.list() ?? [],
    findById: (id) => scan(supervisor, (e) => e.store.pluginRegistryRepo.findById(id)),
    findByName: (name) => scan(supervisor, (e) => e.store.pluginRegistryRepo.findByName(name)),
    upsert: (rec) => {
      const nodes = supervisor.list();
      if (nodes.length === 0) {
        throw new NotFoundError('no workspace runtime');
      }
      const saved = nodes[0]?.store.pluginRegistryRepo.upsert(rec);
      for (const other of nodes.slice(1)) {
        other.store.pluginRegistryRepo.upsert(rec);
      }
      return saved;
    },
    delete: (id) => {
      for (const entry of supervisor.list()) {
        entry.store.pluginRegistryRepo.delete(id);
      }
    },
    replaceCatalog: (registryId, entries) => {
      for (const entry of supervisor.list()) {
        entry.store.pluginRegistryRepo.replaceCatalog(registryId, entries);
      }
    },
    listCatalog: (filter) =>
      supervisor.list()[0]?.store.pluginRegistryRepo.listCatalog(filter) ?? [],
    findCatalogEntry: (registryId, pluginName) =>
      scan(supervisor, (e) => e.store.pluginRegistryRepo.findCatalogEntry(registryId, pluginName)),
  };
}

export function createRoutingAttachmentRepo(supervisor: NodeSupervisor): AttachmentRepository {
  return {
    listByThread: (threadId) =>
      nodeForThread(supervisor, threadId).store.attachmentRepo.listByThread(threadId),
    listPending: (threadId) =>
      nodeForThread(supervisor, threadId).store.attachmentRepo.listPending(threadId),
    findById: (id) => scan(supervisor, (e) => e.store.attachmentRepo.findById(id)),
    insert: (rec) => {
      const thread = scan(supervisor, (e) => e.store.threadRepo.findById(rec.threadId));
      if (!thread) {
        throw new NotFoundError('thread not found');
      }
      return requireNode(supervisor, thread.workspaceId).store.attachmentRepo.insert(rec);
    },
    attach: (entryId, ids, threadId) =>
      nodeForThread(supervisor, threadId).store.attachmentRepo.attach(entryId, ids, threadId),
    delete: (id) => {
      for (const entry of supervisor.list()) {
        if (entry.store.attachmentRepo.findById(id)) {
          entry.store.attachmentRepo.delete(id);
          return;
        }
      }
    },
    deleteByWorkspace: (workspaceId, threadIds) =>
      requireNode(supervisor, workspaceId).store.attachmentRepo.deleteByWorkspace(
        workspaceId,
        threadIds,
      ),
  };
}
