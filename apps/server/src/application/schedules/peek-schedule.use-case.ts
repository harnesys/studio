import type { SchedulePeekFire } from 'harnesys';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { GetThreadInput } from '../threads/get-thread.use-case.ts';
import { peekScheduleFires } from './schedule-peek.ts';
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
  getThread: GetThreadInput;
};
export class PeekScheduleUseCase implements PeekScheduleInput {
  constructor(private readonly deps: PeekScheduleDeps) {}
  async execute(request: PeekScheduleRequest): Promise<PeekScheduleResponse> {
    const workspace = this.deps.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const schedule = this.deps.schedules.findById(request.id);
    if (!schedule || schedule.workspaceId !== request.workspaceId) {
      throw new NotFoundError('schedule not found');
    }
    const thread = await this.deps.getThread.execute({ id: schedule.threadId });
    return {
      id: schedule.id,
      name: schedule.name,
      threadId: schedule.threadId,
      lastFiredAt: schedule.lastFiredAt,
      fires: peekScheduleFires(thread.events, request.last ?? 1, schedule.lastFiredAt),
    };
  }
}
