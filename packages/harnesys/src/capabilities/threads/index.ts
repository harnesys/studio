import { defineCapability } from '../../domain/capability.ts';
import type { ThreadsPort } from '../../ports/threads.ts';
import { createThreadTools } from './create-thread-tools.ts';

export type ThreadsCapabilityPorts = { threads: ThreadsPort };

export const threadsCapability = defineCapability<ThreadsCapabilityPorts>({
  name: 'threads',
  version: '1.0.0',
  description: 'Thread discovery: thread_list',
  requires: ['threads'],
  tools: (ctx) => createThreadTools({ threads: ctx.ports.threads, resolveScope: ctx.resolveScope }),
  prompt: () => `## Threads
- thread_list — threads in this workspace with ids; use an id as threadId on schedule_set to wake another conversation.`,
});
