import {
  DEFAULT_MODE_ID,
  isModeId,
  isScheduleHistory,
  SCHEDULE_STATUSES,
  type ScheduleHistory,
  type ScheduleRecord,
} from '@harnesys/studio-shared';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import type { Agent, AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type {
  SchedulePatch,
  ScheduleRepository,
  ScheduleStatus,
} from '../../domain/schedule.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { requireBindableThread } from './bind-schedule-thread.ts';
import { isValidCron, nextCronRunAt } from './cron-next.ts';
import { toScheduleRecord } from './schedule-record.ts';

export type UpdateScheduleRequest = {
  workspaceId: string;
  id: string;
  name?: string;
  status?: ScheduleStatus;
  targetAgentId?: string;
  detail?: string;
  cron?: string;
  modeId?: string;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
};

export type UpdateScheduleInput = {
  execute(request: UpdateScheduleRequest): Promise<ScheduleRecord>;
};

export type UpdateScheduleDeps = {
  schedules: ScheduleRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  threads: ThreadRepository;
  deskEvents: DeskEventsPort;
  db?: StudioDb;
};

export class UpdateScheduleUseCase implements UpdateScheduleInput {
  private readonly schedules: ScheduleRepository;
  private readonly agents: AgentRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly threads: ThreadRepository;
  private readonly deskEvents: DeskEventsPort;
  private readonly db?: StudioDb;

  constructor(deps: UpdateScheduleDeps) {
    this.schedules = deps.schedules;
    this.agents = deps.agents;
    this.workspaces = deps.workspaces;
    this.threads = deps.threads;
    this.deskEvents = deps.deskEvents;
    this.db = deps.db;
  }

  async execute(request: UpdateScheduleRequest): Promise<ScheduleRecord> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const current = this.schedules.findById(request.id);
    if (!current || current.workspaceId !== request.workspaceId) {
      throw new NotFoundError('schedule not found');
    }

    const patch: SchedulePatch = {
      updatedAt: new Date().toISOString(),
    };
    let nextName: string | undefined;

    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ValidationError('schedule name cannot be empty');
      }
      patch.name = name;
      nextName = name;
    }

    if (request.status !== undefined) {
      if (!(SCHEDULE_STATUSES as readonly string[]).includes(request.status)) {
        throw new ValidationError('invalid schedule status');
      }
      patch.status = request.status;
    }

    let nextAgent: Agent | undefined;
    if (request.targetAgentId !== undefined) {
      const agent = this.agents.findById(request.targetAgentId);
      if (!agent || agent.workspaceId !== request.workspaceId) {
        throw new ValidationError('agent not found');
      }
      patch.targetAgentId = agent.id;
      nextAgent = agent;
    }

    if (request.detail !== undefined) {
      patch.detail = request.detail.trim();
    }

    if (request.cron !== undefined) {
      const cron = request.cron.trim();
      if (!cron) {
        throw new ValidationError('cron cannot be empty');
      }
      if (!isValidCron(cron)) {
        throw new ValidationError('invalid cron');
      }
      patch.cron = cron;
      patch.nextRunAt = nextCronRunAt(cron);
    }

    if (request.modeId !== undefined) {
      const agent = nextAgent ?? this.agents.findById(current.targetAgentId);
      const allowedModeIds = new Set((agent?.modes ?? []).map((mode) => mode.id));
      if (agent?.defaultModeId) {
        allowedModeIds.add(agent.defaultModeId);
      }
      allowedModeIds.add(DEFAULT_MODE_ID);
      if (!isModeId(request.modeId) || !allowedModeIds.has(request.modeId)) {
        throw new ValidationError('schedule modeId is not a mode of the target agent');
      }
      patch.modeId = request.modeId;
    }

    if (request.history !== undefined) {
      if (!isScheduleHistory(request.history)) {
        throw new ValidationError('invalid schedule history');
      }
      patch.history = request.history;
    }

    if (request.historyLast !== undefined) {
      const historyLast = Math.floor(request.historyLast);
      if (!Number.isFinite(historyLast) || historyLast < 1) {
        throw new ValidationError('historyLast must be >= 1');
      }
      patch.historyLast = Math.min(historyLast, 99);
    }

    if (request.threadId !== undefined && request.threadId !== current.threadId) {
      const agentId = patch.targetAgentId ?? current.targetAgentId;
      requireBindableThread({
        threads: this.threads,
        schedules: this.schedules,
        workspaceId: request.workspaceId,
        agentId,
        threadId: request.threadId,
        exceptScheduleId: current.id,
      });
      patch.threadId = request.threadId;
    }

    const previousThreadId = current.threadId;

    const perform = () => {
      const schedule = this.schedules.update(request.id, patch);
      if (nextName !== undefined && nextName !== current.name) {
        const thread = this.threads.findById(schedule.threadId);
        if (thread?.kind === 'schedule') {
          this.threads.updateTitle(schedule.threadId, nextName);
        }
      }
      if (schedule.threadId !== previousThreadId) {
        const previous = this.threads.findById(previousThreadId);
        if (previous?.kind === 'schedule') {
          this.threads.delete(previousThreadId);
        }
      }
      return schedule;
    };

    const schedule = this.db ? this.db.transaction(perform) : perform();
    const record = toScheduleRecord(schedule);
    this.deskEvents.emit(request.workspaceId, { type: 'schedule', schedule: record });
    return await Promise.resolve(record);
  }
}
