import {
  isPluginServerKey,
  readWorkspaceMcpJson,
  writeWorkspaceMcpJson,
} from '../../adapters/mcp-json.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
export type DeleteWorkspaceMcpServerRequest = {
  workspaceId: string;
  serverId: string;
};
export type DeleteWorkspaceMcpServerInput = {
  execute(request: DeleteWorkspaceMcpServerRequest): Promise<void>;
};
export class DeleteWorkspaceMcpServerUseCase implements DeleteWorkspaceMcpServerInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}
  async execute(request: DeleteWorkspaceMcpServerRequest): Promise<void> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    if (isPluginServerKey(request.serverId)) {
      throw new ValidationError(`mcp server ${request.serverId} belongs to a plugin`);
    }
    const map = readWorkspaceMcpJson(workspace.path);
    if (!(request.serverId in map)) {
      throw new NotFoundError(`mcp server ${request.serverId} not found`);
    }
    delete map[request.serverId];
    writeWorkspaceMcpJson(workspace.path, map);
    await this.workspaceHarnesys.invalidate(workspace.id);
  }
}
