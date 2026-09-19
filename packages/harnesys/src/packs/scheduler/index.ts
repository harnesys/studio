import { definePack } from '../../domain/pack.ts';
import type { SchedulerPort } from '../../ports/scheduler.ts';
import { createScheduleTools } from './create-schedule-tools.ts';
export type SchedulerCapabilityPorts = {
  scheduler: SchedulerPort;
};
export const schedulerCapability = definePack<SchedulerCapabilityPorts, Record<string, unknown>>({
  name: 'scheduler',
  version: '1.0.0',
  description:
    'Cron schedules: schedule_list / schedule_set / schedule_pause / schedule_delete / schedule_peek',
  icon: 'scheduler',
  meta: {
    tools: [
      { name: 'schedule_list', description: 'List cron schedules in this workspace.' },
      {
        name: 'schedule_peek',
        description:
          'Read the last fire run(s) from this schedule thread journal (human detail, agent texts, tools, errors). last defaults to 1, max 99.',
      },
      {
        name: 'schedule_set',
        description:
          'Create a cron schedule, or update it when id is set. Defaults to this agent as target. nextRunAt is the next cron instant after create, not now. threadId chooses WHERE the fire lands: omit = new dedicated schedule thread (isolated cron log); "self" = THIS chat (fires here once this run is idle; one active run per thread); uuid from thread_list = that existing conversation. Thread agent must match targetAgentId. One schedule per thread. history=none|last|all folds prior fires only on dedicated schedule threads; historyLast is how many when history=last (1–99).',
      },
      { name: 'schedule_pause', description: 'Pause or resume a schedule by id.' },
      { name: 'schedule_delete', description: 'Delete a schedule by id.' },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createScheduleTools({ scheduler: ctx.ports.scheduler, resolveScope: () => ctx.scope }),
  }),
});
