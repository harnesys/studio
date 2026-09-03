import type { RunTarget, RunTargets } from 'harnesys';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { RuntimeStateRepository } from '../domain/runtime-state.port.ts';
import type { Thread, ThreadRepository } from '../domain/thread.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';
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
};

export class StudioRunTargets implements RunTargets {
  constructor(private readonly deps: StudioRunTargetsDeps) {}

  // biome-ignore lint/suspicious/useAwait: checks are sync today; resolve stays async per RunTargets port
  async resolve(threadId: string): Promise<RunTarget | null> {
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
    const state = this.deps.runtimeStates.forState(threadId);
    return { state, agent, permissions: permissionMapFor(resolveThreadRunMode(thread)) };
  }
}

function resolveThreadRunMode(thread: Thread): RunMode {
  const metadata = thread.metadata as { runMode?: unknown } | null | undefined;
  const mode = metadata !== null && typeof metadata === 'object' ? metadata.runMode : undefined;
  return typeof mode === 'string' && isRunMode(mode) ? mode : 'ask';
}
