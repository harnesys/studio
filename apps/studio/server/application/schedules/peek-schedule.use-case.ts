import type { JournalRepository } from '../../domain/journal.port.ts';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { lastScheduleRuns } from './schedule-fold.ts';
import { compactScheduleRun, type SchedulePeekFire } from './schedule-peek.ts';

export type PeekScheduleRequest = {
  workspaceId: string;
  id: string;
  last?: number;
};

export type PeekScheduleResponse = {
  id: string;
  name: string;
  threadId: string;
  lastFiredAt: string | null;
  fires: SchedulePeekFire[];
};

export type PeekScheduleInput = {
  execute(request: PeekScheduleRequest): Promise<PeekScheduleResponse>;
};

export type PeekScheduleDeps = {
  schedules: ScheduleRepository;
  workspaces: WorkspaceRepository;
  journal: JournalRepository;
};

export class PeekScheduleUseCase implements PeekScheduleInput {
  constructor(private readonly deps: PeekScheduleDeps) {}

  execute(request: PeekScheduleRequest): Promise<PeekScheduleResponse> {
    const workspace = this.deps.workspaces.findById(request.workspaceId);
    if (!workspace) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    const schedule = this.deps.schedules.findById(request.id);
    if (!schedule || schedule.workspaceId !== request.workspaceId) {
      return Promise.reject(new NotFoundError('schedule not found'));
    }
    const last = resolveLast(request.last);
    const journal = this.deps.journal.load(schedule.threadId);
    const fires = lastScheduleRuns(journal, last).map(compactScheduleRun);
    return Promise.resolve({
      id: schedule.id,
      name: schedule.name,
      threadId: schedule.threadId,
      lastFiredAt: schedule.lastFiredAt,
      fires,
    });
  }
}

function resolveLast(last: number | undefined): number {
  if (last === undefined) {
    return 1;
  }
  const value = Math.floor(last);
  if (!Number.isFinite(value) || value < 1) {
    throw new ValidationError('last must be >= 1');
  }
  return Math.min(value, 99);
}
