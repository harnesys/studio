import type { CapabilityScope, ThreadSummary, ThreadsPort } from 'harnesys';
import type { ListSchedulesInput } from '../../application/schedules/list-schedules.use-case.ts';
import type { ListThreadsInput } from '../../application/threads/list-threads.use-case.ts';
export type SqliteThreadsPortDeps = {
  listThreads: ListThreadsInput;
  listSchedules: ListSchedulesInput;
};
export class SqliteThreadsPort implements ThreadsPort {
  constructor(private readonly deps: SqliteThreadsPortDeps) {}
  async list(scope: CapabilityScope): Promise<ThreadSummary[]> {
    const [threads, schedules] = await Promise.all([
      this.deps.listThreads.execute({ workspaceId: scope.workspaceId }),
      this.deps.listSchedules.execute({ workspaceId: scope.workspaceId }),
    ]);
    const occupied = new Set(schedules.map((row) => row.threadId));
    return threads.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      agentId: row.agentId,
      agentName: row.agentName,
      hasSchedule: occupied.has(row.id),
    }));
  }
}
