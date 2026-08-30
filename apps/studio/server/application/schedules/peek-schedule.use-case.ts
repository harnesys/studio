import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

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
  fires: [];
};

export type PeekScheduleInput = {
  execute(request: PeekScheduleRequest): Promise<PeekScheduleResponse>;
};

export type PeekScheduleDeps = {
  schedules: ScheduleRepository;
  workspaces: WorkspaceRepository;
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
    return Promise.resolve({
      id: schedule.id,
      name: schedule.name,
      threadId: schedule.threadId,
      lastFiredAt: schedule.lastFiredAt,
      fires: [],
    });
  }
}
