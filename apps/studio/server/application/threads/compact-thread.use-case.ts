import { PendingHitlError, ThreadBusyError } from 'harnesys';
import type { CompactThreadResponse } from '../../../shared/types.ts';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { runInHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { JournalRepository } from '../../domain/journal.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { publishDeskThread } from './publish-desk-thread.ts';

export type CompactThreadRequest = {
  threadId: string;
};

export type CompactThreadInput = {
  execute(request: CompactThreadRequest): Promise<CompactThreadResponse>;
};

export type CompactThreadDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  journal: JournalRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  activeRuns: ActiveRunRegistry;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  episodic: unknown;
};

export class CompactThreadUseCase implements CompactThreadInput {
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly models: LlmModelRepository;
  private readonly providers: LlmProviderRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly journal: JournalRepository;
  private readonly workspaceHarnesys: WorkspaceHarnesysRegistry;
  private readonly registry: ThreadRuntimeRegistry;
  private readonly activeRuns: ActiveRunRegistry;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;
  private readonly episodic: unknown;

  constructor(deps: CompactThreadDeps) {
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.models = deps.models;
    this.providers = deps.providers;
    this.workspaces = deps.workspaces;
    this.journal = deps.journal;
    this.workspaceHarnesys = deps.workspaceHarnesys;
    this.registry = deps.registry;
    this.activeRuns = deps.activeRuns;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
    this.episodic = deps.episodic;
  }

  async execute(request: CompactThreadRequest): Promise<CompactThreadResponse> {
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
    if (agentRow.compaction == null) {
      throw new ValidationError('compaction is disabled for this agent');
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

        const handle = await this.registry.threadOf(thread.id, hx, agentRow.name, workspace.path);

        try {
          const result = await handle.compact();
          this.journal.saveSnapshot(thread.id, handle.journal);
          this.threads.touch(thread.id);
          this.publishThread(thread.id);
          return {
            journal: handle.journal,
            compacted: result.entry != null,
          };
        } catch (error) {
          if (
            error instanceof ThreadBusyError ||
            error instanceof PendingHitlError
          ) {
            throw new ConflictError(error.message);
          }
          throw error;
        } finally {
          this.registry.forget(thread.id);
        }
      },
    );
  }

  private publishThread(threadId: string): void {
    publishDeskThread(this.getThread, this.deskEvents, threadId);
  }
}
