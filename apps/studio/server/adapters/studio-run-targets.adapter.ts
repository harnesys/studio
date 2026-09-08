import type { CapabilityRegistration, RunTarget, RunTargets, RuntimeHandle } from 'harnesys';
import { allCapabilityToolNames, capabilityToolNames, capabilityTools } from 'harnesys';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { BranchStateSeeder } from '../domain/branch-state-seeder.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
import type { Thread, ThreadRepository } from '../domain/thread.port.ts';
import type { Workspace, WorkspaceRepository } from '../domain/workspace.port.ts';
import { isRunMode, permissionMapFor, type RunMode } from './tool-confirm-policy.ts';
import type { WorkspaceHarnesysRegistry } from './workspace-harnesys.registry.ts';

export type StudioRunTargetsDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  runtimeStates: RuntimeStateRepository;
  branchSeeder: BranchStateSeeder;
};

export class StudioRunTargets implements RunTargets {
  constructor(private readonly deps: StudioRunTargetsDeps) {}

  async resolve(threadId: string): Promise<RunTarget | null> {
    await this.deps.branchSeeder.seedIfNeeded(threadId);
    const thread = this.deps.threads.findById(threadId);
    if (!thread) {
      return null;
    }
    const agentRow = this.deps.agents.findById(thread.agentId);
    if (!agentRow?.modelId) {
      return null;
    }
    const model = this.deps.models.findById(agentRow.modelId);
    if (!model) {
      return null;
    }
    const provider = this.deps.providers.findById(model.providerId);
    if (!provider) {
      return null;
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      return null;
    }
    const agent = this.deps.workspaceHarnesys.resolveAgentDefinition(agentRow.id);
    if (!agent) {
      return null;
    }
    let hx: RuntimeHandle;
    try {
      hx = await this.deps.workspaceHarnesys.get(workspace);
    } catch {
      // runtime creation failed (e.g. bad workspace mcp json): target unavailable
      return null;
    }
    const state = this.deps.runtimeStates.forState(threadId);
    // Same list the runtime was built with (host packs + this workspace's
    // skills pack), or agent capability gating and pruning diverge.
    const registrations = this.effectiveRegistrations(workspace);
    const enabled = new Set(capabilityToolNames(agent, registrations));
    const registry = new Map(hx.tools.registry());
    for (const name of allCapabilityToolNames(registrations)) {
      if (!enabled.has(name)) {
        registry.delete(name);
      }
    }
    // Per-agent instances win over the workspace-wide config:{} copies, so pack
    // specs (e.g. memory.knowledge.spec.topK) reach the tool at execute time.
    for (const t of capabilityTools(agent, registrations)) {
      registry.set(t.name, t);
    }
    return {
      state,
      agent,
      permissions: permissionMapFor(resolveThreadRunMode(thread)),
      paths: { allow: [workspace.path], cwd: workspace.path },
      capabilities: registrations,
      toolRegistry: registry,
      scope: { workspaceId: thread.workspaceId, agentId: thread.agentId, threadId },
    };
  }

  private effectiveRegistrations(workspace: Workspace): CapabilityRegistration[] {
    return this.deps.workspaceHarnesys.effectiveRegistrations(workspace);
  }
}

function resolveThreadRunMode(thread: Thread): RunMode {
  const metadata = thread.metadata as { runMode?: unknown } | null | undefined;
  const mode = metadata !== null && typeof metadata === 'object' ? metadata.runMode : undefined;
  return typeof mode === 'string' && isRunMode(mode) ? mode : 'ask';
}
