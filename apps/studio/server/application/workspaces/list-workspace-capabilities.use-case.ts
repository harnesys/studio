import type { CapabilityCatalogEntry } from 'harnesys';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type ListWorkspaceCapabilitiesRequest = {
  workspaceId: string;
};

export type ListWorkspaceCapabilitiesResponse = {
  capabilities: CapabilityCatalogEntry[];
};

export type ListWorkspaceCapabilitiesInput = {
  execute(request: ListWorkspaceCapabilitiesRequest): Promise<ListWorkspaceCapabilitiesResponse>;
};

export class ListWorkspaceCapabilitiesUseCase implements ListWorkspaceCapabilitiesInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(
    request: ListWorkspaceCapabilitiesRequest,
  ): Promise<ListWorkspaceCapabilitiesResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const hx = await this.workspaceHarnesys.get(workspace);
    return { capabilities: hx.capabilities.list() };
  }
}
