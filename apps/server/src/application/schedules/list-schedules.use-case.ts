import type { ScheduleRecord } from '@harnesys/studio-shared';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { toScheduleRecord } from './schedule-record.ts';
export type ListSchedulesRequest = {
  workspaceId: string;
};
export type ListSchedulesInput = {
  execute(request: ListSchedulesRequest): Promise<ScheduleRecord[]>;
};
export class ListSchedulesUseCase implements ListSchedulesInput {
  constructor(
    private readonly schedules: ScheduleRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(request: ListSchedulesRequest): Promise<ScheduleRecord[]> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      return Promise.reject(new NotFoundError('workspace not found'));
    }
    return Promise.resolve(
      this.schedules.listByWorkspace(request.workspaceId).map(toScheduleRecord),
    );
  }
}
