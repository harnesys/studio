import {
  type CreateScheduleResponse,
  isScheduleHistory,
  type PermissionMode,
  type ScheduleHistory,
} from '../../../shared/types.ts';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import { isPermissionMode } from '../../adapters/tool-confirm-policy.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { readFields } from '../threads/thread.helpers.ts';
import { requireBindableThread } from './bind-schedule-thread.ts';
import { isValidCron } from './cron-next.ts';
import { toScheduleRecord } from './schedule-record.ts';

export type CreateScheduleRequest = {
  workspaceId: string;
  name: string;
  targetAgentId: string;
  detail?: string;
  cron?: string;
  mode?: PermissionMode;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
};

export type CreateScheduleInput = {
  execute(request: CreateScheduleRequest): Promise<CreateScheduleResponse>;
};

export type CreateScheduleDeps = {
  schedules: ScheduleRepository;
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  deskEvents: DeskEventsPort;
  db?: StudioDb;
};

export class CreateScheduleUseCase implements CreateScheduleInput {
  private readonly schedules: ScheduleRepository;
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly deskEvents: DeskEventsPort;
  private readonly db?: StudioDb;

  constructor(deps: CreateScheduleDeps) {
    this.schedules = deps.schedules;
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.workspaces = deps.workspaces;
    this.deskEvents = deps.deskEvents;
    this.db = deps.db;
  }

  async execute(request: CreateScheduleRequest): Promise<CreateScheduleResponse> {
    const name = request.name?.trim();
    if (!name) {
      throw new ValidationError('schedule name is required');
    }

    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const agent = this.agents.findById(request.targetAgentId);
    if (!agent || agent.workspaceId !== request.workspaceId) {
      throw new ValidationError('agent not found');
    }

    const now = new Date().toISOString();
    const existingThread = request.threadId
      ? requireBindableThread({
          threads: this.threads,
          schedules: this.schedules,
          workspaceId: request.workspaceId,
          agentId: agent.id,
          threadId: request.threadId,
        })
      : undefined;
    const threadId = existingThread?.id ?? crypto.randomUUID();
    const scheduleId = crypto.randomUUID();
    const detail = request.detail?.trim() || '';
    const cron = request.cron?.trim() || '0 * * * *';
    if (!isValidCron(cron)) {
      throw new ValidationError('invalid cron');
    }
    const mode: PermissionMode =
      request.mode && isPermissionMode(request.mode) ? request.mode : 'auto';

    let history: ScheduleHistory = 'none';
    if (request.history !== undefined) {
      if (!isScheduleHistory(request.history)) {
        throw new ValidationError('invalid schedule history');
      }
      history = request.history;
    }

    let historyLast = 1;
    if (request.historyLast !== undefined) {
      const value = Math.floor(request.historyLast);
      if (!Number.isFinite(value) || value < 1) {
        throw new ValidationError('historyLast must be >= 1');
      }
      historyLast = Math.min(value, 99);
    }

    const perform = () => {
      const thread =
        existingThread ??
        this.threads.insert({
          id: threadId,
          workspaceId: request.workspaceId,
          agentId: agent.id,
          originAgentId: agent.id,
          title: name,
          kind: 'schedule',
          metadata: {},
          createdAt: now,
          updatedAt: now,
          lastReadAt: now,
        });
      const schedule = this.schedules.insert({
        id: scheduleId,
        workspaceId: request.workspaceId,
        name,
        status: 'active',
        targetAgentId: agent.id,
        detail,
        cron,
        mode,
        history,
        historyLast,
        threadId: thread.id,
        nextRunAt: now,
        lastFiredAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { thread, schedule };
    };

    const { thread, schedule } = this.db ? this.db.transaction(perform) : perform();

    const created = {
      schedule: toScheduleRecord(schedule),
      thread: {
        id: thread.id,
        title: thread.title,
        agentId: thread.agentId,
        originAgentId: thread.originAgentId,
        agentName: agent.name,
        workspaceId: thread.workspaceId,
        kind: thread.kind,
        parentThreadId: thread.parentThreadId ?? null,
        forkAt: thread.forkAt ?? null,
        inheritedEventCount: 0,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        ...readFields(thread),
        pinned: false,
        events: [],
        activeRun: null,
      },
    };
    this.deskEvents.emit(request.workspaceId, {
      type: 'schedule',
      schedule: created.schedule,
    });
    if (!existingThread) {
      this.deskEvents.emit(request.workspaceId, { type: 'thread', thread: created.thread });
    }
    return await Promise.resolve(created);
  }
}
