import { defineCapability } from '../../domain/pack.ts';
import type { SchedulerPort } from '../../ports/scheduler.ts';
import { createScheduleTools } from './create-schedule-tools.ts';
import { SCHEDULER_PROMPT_FRAGMENT } from './prompt.ts';

export type SchedulerCapabilityPorts = { scheduler: SchedulerPort };

export const schedulerCapability = defineCapability<SchedulerCapabilityPorts>({
  name: 'scheduler',
  version: '1.0.0',
  description:
    'Cron schedules: schedule_list / schedule_set / schedule_pause / schedule_delete / schedule_peek',
  requires: ['scheduler'],
  dependsOn: ['threads'],
  tools: (ctx) =>
    createScheduleTools({ scheduler: ctx.ports.scheduler, resolveScope: ctx.resolveScope }),
  prompt: () => SCHEDULER_PROMPT_FRAGMENT,
});
