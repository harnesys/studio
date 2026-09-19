import type { WorkspaceStatus } from '@harnesys/studio-shared';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspacePort } from '../../domain/workspace.port.ts';
import type { NodeRegistry } from '../nodes/node-registry.ts';
export type GetWorkspaceStatusRequest = {
  id: string;
};
export type GetWorkspaceStatusInput = {
  execute(request: GetWorkspaceStatusRequest): Promise<WorkspaceStatus>;
};
export class GetWorkspaceStatusUseCase implements GetWorkspaceStatusInput {
  constructor(
    private readonly nodes: NodeRegistry,
    private readonly workspaceFs: WorkspacePort,
  ) {}
  async execute(request: GetWorkspaceStatusRequest): Promise<WorkspaceStatus> {
    const node = this.nodes.get(request.id);
    if (!node) {
      throw new NotFoundError('workspace not found');
    }
    return await this.workspaceFs.inspect(node.path);
  }
}
