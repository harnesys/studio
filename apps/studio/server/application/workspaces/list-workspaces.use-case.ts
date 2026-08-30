import type { WorkspaceRecord } from '../../../shared/types.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type ListWorkspacesInput = {
  execute(): Promise<WorkspaceRecord[]>;
};

export class ListWorkspacesUseCase implements ListWorkspacesInput {
  constructor(private readonly workspaces: WorkspaceRepository) {}

  execute(): Promise<WorkspaceRecord[]> {
    return Promise.resolve(this.workspaces.list());
  }
}
