import type { CapabilityScope } from '../../domain/pack.ts';
import type { PermissionMode, ScheduleHistory } from '../../domain/schedule.ts';
import type { SchedulerPort, ScheduleUpdateInput } from '../../ports/scheduler.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateScheduleToolsParams = {
  scheduler: SchedulerPort;
  resolveScope: () => CapabilityScope;
};

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

type ScheduleSetInput = {
  id?: string;
  name?: string;
  cron?: string;
  detail?: string;
  targetAgentId?: string;
  mode?: PermissionMode;
  history?: ScheduleHistory;
  historyLast?: number;
  threadId?: string;
};

type SchedulePauseInput = {
  id: string;
  paused: boolean;
};

type SchedulePeekInput = {
  id: string;
  last?: number;
};

type ScheduleDeleteInput = {
  id: string;
};

export function createScheduleTools(deps: CreateScheduleToolsParams): ToolDefinition[] {
  return [
    tool('schedule_list', {
      group: 'schedules',
      description: 'List cron schedules in this workspace.',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const rows = await deps.scheduler.list(scope);
          return rows.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            cron: row.cron,
            detail: row.detail,
            targetAgentId: row.targetAgentId,
            mode: row.mode,
            history: row.history,
            historyLast: row.historyLast,
            nextRunAt: row.nextRunAt,
            threadId: row.threadId,
            lastFiredAt: row.lastFiredAt,
          }));
        }),
    }),
    tool('schedule_peek', {
      group: 'schedules',
      description:
        'Read the last fire run(s) from this schedule thread journal (human detail, agent texts, tools, errors). last defaults to 1, max 99.',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          last: { type: 'integer', minimum: 1, maximum: 99 },
        },
        required: ['id'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as SchedulePeekInput;
          return await deps.scheduler.peek(scope, input.id, input.last);
        }),
    }),
    tool('schedule_set', {
      group: 'schedules',
      description:
        'Create a cron schedule (omit id: ids are auto-generated, never invent one), or update an existing one with id taken from schedule_list. Defaults to this agent as target. nextRunAt is the next cron instant after create, not now. threadId chooses WHERE the fire lands: omit = new dedicated schedule thread (isolated cron log); "self" = THIS chat (fires here once this run is idle; one active run per thread); uuid from thread_list = that existing conversation. Thread agent must match targetAgentId. One schedule per thread. history=none|last|all folds prior fires only on dedicated schedule threads; historyLast is how many when history=last (1–99).',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          cron: { type: 'string' },
          detail: { type: 'string' },
          targetAgentId: { type: 'string' },
          mode: { type: 'string', enum: ['ask', 'auto', 'dont_ask', 'bypass'] },
          history: { type: 'string', enum: ['none', 'last', 'all'] },
          historyLast: { type: 'integer', minimum: 1, maximum: 99 },
          threadId: { type: 'string' },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as ScheduleSetInput;
          if (input.id) {
            const patch: ScheduleUpdateInput = {
              name: input.name,
              cron: input.cron,
              detail: input.detail,
              targetAgentId: input.targetAgentId,
              mode: input.mode,
              history: input.history,
              historyLast: input.historyLast,
            };
            return await deps.scheduler.update(scope, input.id, patch);
          }
          if (!input.name) {
            return { error: 'name is required to create a schedule' };
          }
          const created = await deps.scheduler.create(scope, {
            name: input.name,
            targetAgentId: input.targetAgentId ?? scope.agentId,
            cron: input.cron,
            detail: input.detail,
            mode: input.mode,
            history: input.history,
            historyLast: input.historyLast,
            threadId: resolveCreateThreadId(input.threadId, scope.threadId),
          });
          return {
            schedule: created.schedule,
            thread: {
              id: created.thread.id,
              title: created.thread.title,
              kind: created.thread.kind,
              agentId: created.thread.agentId,
            },
          };
        }),
    }),
    tool('schedule_pause', {
      group: 'schedules',
      description: 'Pause or resume a schedule by id.',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          paused: { type: 'boolean' },
        },
        required: ['id', 'paused'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as SchedulePauseInput;
          return await deps.scheduler.update(scope, input.id, {
            status: input.paused ? 'paused' : 'active',
          });
        }),
    }),
    tool('schedule_delete', {
      group: 'schedules',
      description: 'Delete a schedule by id.',
      input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as ScheduleDeleteInput;
          await deps.scheduler.remove(scope, input.id);
          return { ok: true, id: input.id };
        }),
    }),
  ];
}

function resolveCreateThreadId(
  raw: string | undefined,
  currentThreadId: string,
): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const threadId = raw.trim();
  if (!threadId) {
    return undefined;
  }
  if (threadId === 'self') {
    return currentThreadId;
  }
  return threadId;
}
