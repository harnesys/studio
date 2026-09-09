import { definePack } from '../../domain/pack.ts';
import type { ThreadsPort } from '../../ports/threads.ts';
import { createThreadTools } from './create-thread-tools.ts';

export type ThreadsCapabilityPorts = { threads: ThreadsPort };

export const threadsCapability = definePack<ThreadsCapabilityPorts, Record<string, unknown>>({
  name: 'threads',
  version: '1.0.0',
  description: 'Thread discovery: thread_list',
  icon: 'threads',
  meta: {
    tools: [
      {
        name: 'thread_list',
        description:
          'List threads in this workspace. Use the id with schedule_set threadId to wake that conversation. current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createThreadTools({ threads: ctx.ports.threads, resolveScope: () => ctx.scope }),
  }),
});
