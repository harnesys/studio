import type { CapabilityScope } from '../../domain/pack.ts';
import type { ThreadsPort } from '../../ports/threads.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
export type CreateThreadToolsParams = {
  threads: ThreadsPort;
  resolveScope: () => CapabilityScope;
};
async function runGuard<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      error: string;
    }
> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
export function createThreadTools(deps: CreateThreadToolsParams): ToolDefinition[] {
  return [
    tool('thread_list', {
      group: 'schedules',
      description:
        'List threads in this workspace. Use the id with schedule_set threadId to wake that conversation. current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const threads = await deps.threads.list(scope);
          return threads.map((row) => ({
            id: row.id,
            title: row.title,
            kind: row.kind,
            agentId: row.agentId,
            agentName: row.agentName,
            current: row.id === scope.threadId,
            hasSchedule: row.hasSchedule ?? false,
          }));
        }),
    }),
  ];
}
