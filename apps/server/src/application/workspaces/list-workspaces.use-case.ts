import type { WorkspaceRecord } from '@harnesys/studio-shared';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { NodeRegistry } from '../nodes/node-registry.ts';
export type ListWorkspacesInput = {
  execute(): Promise<WorkspaceRecord[]>;
};
export class ListWorkspacesUseCase implements ListWorkspacesInput {
  constructor(
    private readonly nodes: NodeRegistry,
    private readonly workspaces: WorkspaceRepository,
  ) {}
  execute(): Promise<WorkspaceRecord[]> {
    const records = this.nodes.list().map((node) => {
      const row = this.workspaces.findById(node.id);
      return {
        id: node.id,
        name: node.name,
        path: node.path,
        createdAt: row?.createdAt ?? epochIso(),
        status: this.nodes.status(node.id),
      } satisfies WorkspaceRecord;
    });
    return Promise.resolve(records);
  }
}
function epochIso(): string {
  return new Date(0).toISOString();
}
