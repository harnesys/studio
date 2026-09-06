import { join } from 'node:path';
import type {
  AgentDefinition,
  AgentGenerationSettings,
  AgentModelRef,
  CapabilityRegistration,
  CursorMcpJson,
  ModelsPort,
  RunClaimer,
  RunEventFeed,
  RunEventStore,
  RunLifecycleStore,
  RuntimeHandle,
} from 'harnesys';
import { createRuntime, registerCapability, skillsCapability } from 'harnesys';
import { askUser } from 'harnesys/actions';
import { FsSkillRegistry } from 'harnesys/adapters/node';
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

  constructor(
    private readonly models: ModelsPort,
    private readonly repos: WorkspaceHarnesysRepos = {},
    private readonly runtime?: WorkspaceRuntimeWiring,
    private readonly capabilityRegistrations: CapabilityRegistration[] = [],
  ) {}

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

  /** Pack tools enter the runtime registry in full; per-run targets prune disabled packs. */
  private capabilityTools() {
    return this.capabilityRegistrations.flatMap((reg) =>
      reg.pack.tools({ ports: reg.ports, resolveScope: reg.resolveScope, config: {} }),
    );
  }

  /**
   * Host registrations plus the skills pack bound to this workspace's skill
   * registry. Run targets must resolve against the same list, or agent
   * capabilities referencing "skills" warn unknown and load_skill disappears.
   */
  effectiveRegistrations(workspace: Workspace): CapabilityRegistration[] {
    const skills = new FsSkillRegistry({
      roots: [join(workspace.path, '.agents', 'skills')],
    });
    return [
      ...this.capabilityRegistrations,
      registerCapability(skillsCapability, { skills }, () => ({
        workspaceId: '_',
        agentId: '_',
        threadId: '_',
      })),
    ];
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
      // files/shell/fetch come from the base packs in capabilityRegistrations;
      // ask_user has no pack. Per-agent gating happens in the run targets.
      tools: [askUser(), ...this.capabilityTools()],
      capabilities: [...this.capabilityRegistrations],
      agents: { resolve: (id: string) => this.resolveAgent(id) },
      mcp: mcpJson,
      paths: { allow: [workspace.path], cwd: workspace.path },
      skills,
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
    return {
      id: agent.id,
      prompts: { main: { instructions: agent.instructions } },
      model: this.resolveModelRef(agent),
      skills: agent.skills.length ? agent.skills : undefined,
      tools: agent.tools.length ? agent.tools : undefined,
      mcpServers: agent.mcpServers.length ? agent.mcpServers : undefined,
      toolOutput: agent.toolOutput ?? undefined,
      compaction: agent.compaction,
      memory: agent.memory,
      capabilities: agent.capabilities,
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
