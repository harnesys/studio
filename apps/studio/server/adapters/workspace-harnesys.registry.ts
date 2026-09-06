import { join } from 'node:path';
import type {
  AgentDefinition,
  AgentGenerationSettings,
  AgentModelRef,
  CursorMcpJson,
  LlmNoteProvider,
  ModelsPort,
  RunClaimer,
  RunEventFeed,
  RunEventStore,
  RunLifecycleStore,
  RuntimeHandle,
  ToolDefinition,
} from 'harnesys';
import { createRuntime } from 'harnesys';
import { askUser, fetch, files, shell } from 'harnesys/actions';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import { composeAgentSystem } from '../../shared/default-agent-instructions.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import { ValidationError } from '../domain/studio.error.ts';
import type { Workspace } from '../domain/workspace.port.ts';
import { readWorkspaceMcpJson } from './mcp-json.adapter.ts';

export type WorkspaceHarnesysRepos = {
  agents?: AgentRepository;
  modelRepo?: LlmModelRepository;
  providerRepo?: LlmProviderRepository;
};

export type WorkspaceRuntimeWiring = {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  claimer: RunClaimer;
  instanceId: string;
};

export class WorkspaceHarnesysRegistry {
  private readonly cache = new Map<string, Promise<RuntimeHandle>>();
  private extraTools: ToolDefinition[] = [];

  constructor(
    private readonly models: ModelsPort,
    private readonly repos: WorkspaceHarnesysRepos = {},
    private readonly runtime?: WorkspaceRuntimeWiring,
    private readonly notes: LlmNoteProvider[] = [],
  ) {}

  setExtraTools(tools: ToolDefinition[]): void {
    this.extraTools = tools;
    for (const workspaceId of [...this.cache.keys()]) {
      void this.forget(workspaceId);
    }
  }

  get(workspace: Workspace): Promise<RuntimeHandle> {
    const cached = this.cache.get(workspace.id);
    if (cached) {
      return cached;
    }

    const pending = this.create(workspace);
    this.cache.set(workspace.id, pending);
    pending.catch(() => {
      if (this.cache.get(workspace.id) === pending) {
        this.cache.delete(workspace.id);
      }
    });
    return pending;
  }

  invalidate(workspaceId: string): Promise<void> {
    return this.forget(workspaceId);
  }

  async forget(workspaceId: string): Promise<void> {
    const pending = this.cache.get(workspaceId);
    this.cache.delete(workspaceId);
    if (!pending) {
      return;
    }
    try {
      const rt = await pending;
      await rt.close();
    } catch {
      // create failed; nothing to close
    }
  }

  private create(workspace: Workspace): Promise<RuntimeHandle> {
    let mcpJson: CursorMcpJson;
    try {
      mcpJson = { mcpServers: readWorkspaceMcpJson(workspace.path) };
    } catch (err) {
      return Promise.reject(new ValidationError(err instanceof Error ? err.message : String(err)));
    }
    const skills = new FsSkillRegistry({
      roots: [join(workspace.path, '.agents', 'skills')],
    });
    return createRuntime({
      models: this.models,
      tools: [...files(), shell(), fetch(), askUser(), ...this.extraTools],
      agents: { resolve: (id: string) => this.resolveAgent(id) },
      mcp: mcpJson,
      paths: { allow: [workspace.path], cwd: workspace.path },
      skills,
      notes: this.notes,
      ...this.runtime,
    });
  }

  resolveAgentDefinition(id: string): AgentDefinition | undefined {
    return this.resolveAgent(id);
  }

  private resolveAgent(id: string): AgentDefinition | undefined {
    if (!this.repos.agents) {
      return undefined;
    }
    const agent = this.repos.agents.findById(id);
    if (!agent) {
      return undefined;
    }
    const system = composeAgentSystem(agent.instructions);
    return {
      id: agent.id,
      prompts: { main: { instructions: system } },
      model: this.resolveModelRef(agent),
      skills: agent.skills.length ? agent.skills : undefined,
      tools: agent.tools.length ? agent.tools : undefined,
      mcpServers: agent.mcpServers.length ? agent.mcpServers : undefined,
      toolOutput: agent.toolOutput ?? undefined,
      compaction: agent.compaction,
      memory: agent.memory,
      graph: agent.graph,
      budget: agent.budget ?? undefined,
    };
  }

  private resolveModelRef(agent: {
    modelId: string | null;
    effort: string | null;
    generation: unknown;
  }): AgentModelRef | undefined {
    if (!agent.modelId) {
      return undefined;
    }
    const effort = agent.effort ?? undefined;
    const generation = agent.generation as AgentGenerationSettings | undefined;
    if (this.repos.modelRepo && this.repos.providerRepo) {
      const model = this.repos.modelRepo.findById(agent.modelId);
      if (model) {
        const provider = this.repos.providerRepo.findById(model.providerId);
        if (provider) {
          return {
            provider: provider.name,
            model: model.name,
            effort,
            generation,
          };
        }
      }
      return undefined;
    }
    return {
      provider: '',
      model: '',
      effort,
      generation,
    };
  }
}
