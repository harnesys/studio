import {
  type AgentRun,
  type EpisodicPort,
  isAgentEntry,
  isHumanEntry,
  type Journal,
  lastAgentEntry,
  NothingToResumeError,
  ThreadBusyError,
} from 'harnesys';
import type { AcceptedRunResponse } from '../../../shared/types.ts';
import type { ActiveRunRegistry } from '../../adapters/active-runs.adapter.ts';
import { runInHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import {
  isPermissionMode,
  type PermissionMode,
  toolPermissionFor,
} from '../../adapters/tool-confirm-policy.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { JournalRepository } from '../../domain/journal.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import type { Schedule, ScheduleRepository } from '../../domain/schedule.port.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { isScheduleHuman, scheduleFoldHistory } from '../schedules/schedule-fold.ts';
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
  journal: JournalRepository;
  schedules: ScheduleRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  activeRuns: ActiveRunRegistry;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  episodic: EpisodicPort;
};

export class ResumeThreadRunUseCase implements ResumeThreadRunInput {
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly models: LlmModelRepository;
  private readonly providers: LlmProviderRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly journal: JournalRepository;
  private readonly schedules: ScheduleRepository;
  private readonly workspaceHarnesys: WorkspaceHarnesysRegistry;
  private readonly registry: ThreadRuntimeRegistry;
  private readonly activeRuns: ActiveRunRegistry;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;
  private readonly episodic: EpisodicPort;

  constructor(deps: ResumeThreadRunDeps) {
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.models = deps.models;
    this.providers = deps.providers;
    this.workspaces = deps.workspaces;
    this.journal = deps.journal;
    this.schedules = deps.schedules;
    this.workspaceHarnesys = deps.workspaceHarnesys;
    this.registry = deps.registry;
    this.activeRuns = deps.activeRuns;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
    this.episodic = deps.episodic;
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

        const handle = await this.registry.threadOf(thread.id, hx, agentRow.name, workspace.path);
        const mode = permissionModeFromJournal(handle.journal);
        const controller = new AbortController();
        let run: AgentRun;
        try {
          run = handle.resume({
            signal: controller.signal,
            toolPermission: toolPermissionFor(mode),
            permissionMode: mode,
            foldJournal: foldJournalForResume(
              handle.journal,
              thread.kind === 'schedule' ? this.schedules.findByThreadId(thread.id) : undefined,
            ),
          });
        } catch (error) {
          if (error instanceof NothingToResumeError) {
            throw new ValidationError(error.message);
          }
          if (error instanceof ThreadBusyError) {
            throw new ConflictError(error.message);
          }
          throw error;
        }

        this.activeRuns.register(run.id, thread.id, run, controller);
        this.journal.saveSnapshot(thread.id, handle.journal);
        publishDeskThread(this.getThread, this.deskEvents, thread.id);
        void drainAgentRun({
          threadId: thread.id,
          run,
          handle,
          journal: this.journal,
          activeRuns: this.activeRuns,
          registry: this.registry,
          onPersist: (threadId) => publishDeskThread(this.getThread, this.deskEvents, threadId),
        });

        return {
          runId: run.id,
          status: 'accepted',
          journal: handle.journal,
        };
      },
    );
  }
}

function permissionModeFromJournal(journal: Journal): PermissionMode {
  for (let i = journal.entries.length - 1; i >= 0; i -= 1) {
    const entry = journal.entries[i];
    if (!entry || !isAgentEntry(entry)) {
      continue;
    }
    const mode = entry.config?.permissionMode;
    if (mode && isPermissionMode(mode)) {
      return mode;
    }
    break;
  }
  return 'ask';
}

function foldJournalForResume(journal: Journal, schedule: Schedule | undefined) {
  if (!schedule) {
    return undefined;
  }
  const agent = lastAgentEntry(journal);
  if (!agent) {
    return undefined;
  }
  const idx = journal.entries.findIndex((entry) => entry.id === agent.id);
  const prev = idx > 0 ? journal.entries[idx - 1] : undefined;
  if (!prev || !isHumanEntry(prev) || !isScheduleHuman(prev)) {
    return undefined;
  }
  return {
    entries: [
      ...scheduleFoldHistory(journal, schedule.history, schedule.historyLast, prev.id),
      prev,
      agent,
    ],
  };
}
