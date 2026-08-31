import { type AgentRun, ThreadBusyError } from 'harnesys';
import type { AcceptedRunResponse } from '../../../shared/types.ts';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { runInHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { drainAgentRun } from './drain-agent-run.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { publishDeskThread } from './publish-desk-thread.ts';

export type ResumeThreadRunRequest = {
  threadId: string;
};

export type ResumeThreadRunInput = {
  execute(request: ResumeThreadRunRequest): Promise<AcceptedRunResponse>;
};

export type ResumeThreadRunDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  activeRuns: ActiveRunRegistry;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
};

export class ResumeThreadRunUseCase implements ResumeThreadRunInput {
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly models: LlmModelRepository;
  private readonly providers: LlmProviderRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly workspaceHarnesys: WorkspaceHarnesysRegistry;
  private readonly registry: ThreadRuntimeRegistry;
  private readonly activeRuns: ActiveRunRegistry;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;

  constructor(deps: ResumeThreadRunDeps) {
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.models = deps.models;
    this.providers = deps.providers;
    this.workspaces = deps.workspaces;
    this.workspaceHarnesys = deps.workspaceHarnesys;
    this.registry = deps.registry;
    this.activeRuns = deps.activeRuns;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
  }

  async execute(request: ResumeThreadRunRequest): Promise<AcceptedRunResponse> {
    const thread = this.threads.findById(request.threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }

    if (this.activeRuns.findByThread(thread.id)) {
      throw new ConflictError('thread already has a live run');
    }

    const agentRow = this.agents.findById(thread.agentId);
    if (!agentRow) {
      throw new NotFoundError('agent not found');
    }
    if (!agentRow.modelId) {
      throw new ValidationError('agent has no model');
    }

    const model = this.models.findById(agentRow.modelId);
    if (!model) {
      throw new NotFoundError('model not found');
    }
    const provider = this.providers.findById(model.providerId);
    if (!provider) {
      throw new NotFoundError('provider not found');
    }

    const workspace = this.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    return await runInHostToolScope(
      { workspaceId: workspace.id, agentId: agentRow.id, threadId: thread.id },
      async () => {
        const hx = await this.workspaceHarnesys.get(workspace);
        const handle = await this.registry.threadOf(thread.id, hx, agentRow.id, workspace.path);

        const controller = new AbortController();
        let run: AgentRun;
        try {
          run = handle.resume({
            signal: controller.signal,
          });
        } catch (error: unknown) {
          if (error instanceof ThreadBusyError) {
            throw new ConflictError(error.message);
          }
          throw error;
        }

        this.activeRuns.register(run.id, thread.id, run, controller);
        publishDeskThread(this.getThread, this.deskEvents, thread.id);
        void drainAgentRun({
          threadId: thread.id,
          run,
          activeRuns: this.activeRuns,
          registry: this.registry,
          onPersist: (threadId) => publishDeskThread(this.getThread, this.deskEvents, threadId),
        });

        return {
          runId: run.id,
          status: 'accepted',
        };
      },
    );
  }
}
