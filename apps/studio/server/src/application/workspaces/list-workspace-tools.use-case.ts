import type { WorkspaceTool } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type ListWorkspaceToolsRequest = {
  workspaceId: string;
};

export type ListWorkspaceToolsResponse = {
  tools: WorkspaceTool[];
};

export type ListWorkspaceToolsInput = {
  execute(request: ListWorkspaceToolsRequest): Promise<ListWorkspaceToolsResponse>;
};

export class ListWorkspaceToolsUseCase implements ListWorkspaceToolsInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: ListWorkspaceToolsRequest): Promise<ListWorkspaceToolsResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const hx = await this.workspaceHarnesys.get(workspace);
    return {
      tools: hx.tools.list().map((entry) => ({
        name: entry.name,
        description: entry.description,
        ...(entry.group !== undefined ? { group: entry.group } : {}),
      })),
    };
  }
}
