import { type ToolDefinition, tool } from 'harnesys';
import { z } from 'zod';
import type { PermissionMode, ScheduleHistory } from '../../../shared/types.ts';
import { requireHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { CreateScheduleInput } from '../schedules/create-schedule.use-case.ts';
import type { DeleteScheduleInput } from '../schedules/delete-schedule.use-case.ts';
import type { ListSchedulesInput } from '../schedules/list-schedules.use-case.ts';
import type { PeekScheduleInput } from '../schedules/peek-schedule.use-case.ts';
import type { UpdateScheduleInput } from '../schedules/update-schedule.use-case.ts';
import type { ListThreadsInput } from '../threads/list-threads.use-case.ts';
import { runHostTool } from './run-host-tool.ts';

export type ScheduleToolsDeps = {
  listSchedules: ListSchedulesInput;
  listThreads: ListThreadsInput;
  peekSchedule: PeekScheduleInput;
  createSchedule: CreateScheduleInput;
  updateSchedule: UpdateScheduleInput;
  deleteSchedule: DeleteScheduleInput;
};

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

export function createScheduleTools(deps: ScheduleToolsDeps): ToolDefinition[] {
  return [
    tool('schedule_list', {
      group: 'schedules',
      description: 'List cron schedules in this workspace.',
      input: z.object({}),
      execute: async () =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const rows = await deps.listSchedules.execute({ workspaceId: scope.workspaceId });
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
    tool('thread_list', {
      group: 'schedules',
      description:
        'List threads in this workspace. Use the id with schedule_set threadId to wake that conversation. current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).',
      input: z.object({}),
      execute: async () =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const [threads, schedules] = await Promise.all([
            deps.listThreads.execute({ workspaceId: scope.workspaceId }),
            deps.listSchedules.execute({ workspaceId: scope.workspaceId }),
          ]);
          const occupied = new Set(schedules.map((row) => row.threadId));
          return threads.map((row) => ({
            id: row.id,
            title: row.title,
            kind: row.kind,
            agentId: row.agentId,
            agentName: row.agentName,
            current: row.id === scope.threadId,
            hasSchedule: occupied.has(row.id),
          }));
        }),
    }),
    tool('schedule_peek', {
      group: 'schedules',
      description:
        'Read the last fire run(s) from this schedule thread journal (human detail, agent texts, tools, errors). last defaults to 1, max 99.',
      input: z.object({
        id: z.string(),
        last: z.number().int().min(1).max(99).optional(),
      }),
      execute: async (raw) =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as SchedulePeekInput;
          return await deps.peekSchedule.execute({
            workspaceId: scope.workspaceId,
            id: input.id,
            last: input.last,
          });
        }),
    }),
    tool('schedule_set', {
      group: 'schedules',
      description:
        'Create a cron schedule, or update it when id is set. Defaults to this agent as target. threadId chooses WHERE the fire lands: omit = new dedicated schedule thread (isolated cron log); "self" = THIS chat (wake yourself here); uuid from thread_list = that existing conversation. Thread agent must match targetAgentId. One schedule per thread. history=none|last|all folds prior fires only on dedicated schedule threads; historyLast is how many when history=last (1–99).',
      input: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        cron: z.string().optional(),
        detail: z.string().optional(),
        targetAgentId: z.string().optional(),
        mode: z.enum(['ask', 'auto', 'dont_ask', 'bypass']).optional(),
        history: z.enum(['none', 'last', 'all']).optional(),
        historyLast: z.number().int().min(1).max(99).optional(),
        threadId: z.union([z.literal('self'), z.string().uuid()]).optional(),
      }),
      execute: async (raw) =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as ScheduleSetInput;
          if (input.id) {
            return await deps.updateSchedule.execute({
              workspaceId: scope.workspaceId,
              id: input.id,
              name: input.name,
              cron: input.cron,
              detail: input.detail,
              targetAgentId: input.targetAgentId,
              mode: input.mode,
              history: input.history,
              historyLast: input.historyLast,
            });
          }
          if (!input.name) {
            return { error: 'name is required to create a schedule' };
          }
          const created = await deps.createSchedule.execute({
            workspaceId: scope.workspaceId,
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
      input: z.object({
        id: z.string(),
        paused: z.boolean(),
      }),
      execute: async (raw) =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as SchedulePauseInput;
          return await deps.updateSchedule.execute({
            workspaceId: scope.workspaceId,
            id: input.id,
            status: input.paused ? 'paused' : 'active',
          });
        }),
    }),
    tool('schedule_delete', {
      group: 'schedules',
      description: 'Delete a schedule by id.',
      input: z.object({ id: z.string() }),
      execute: async (raw) =>
        runHostTool(async () => {
          const scope = requireHostToolScope();
          const input = raw as ScheduleDeleteInput;
          await deps.deleteSchedule.execute({
            workspaceId: scope.workspaceId,
            id: input.id,
          });
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
