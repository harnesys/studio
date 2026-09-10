import type { WorkspaceMcpServer, WorkspaceMcpTransport } from '@harnesys/studio-shared';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type GetWorkspaceMcpRequest = {
  workspaceId: string;
};

export type GetWorkspaceMcpResponse = {
  servers: WorkspaceMcpServer[];
};

export type GetWorkspaceMcpInput = {
  execute(request: GetWorkspaceMcpRequest): Promise<GetWorkspaceMcpResponse>;
};

export class GetWorkspaceMcpUseCase implements GetWorkspaceMcpInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: GetWorkspaceMcpRequest): Promise<GetWorkspaceMcpResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const hx = await this.workspaceHarnesys.get(workspace);
    const snapshot = await hx.mcp.list();
    return {
      servers: snapshot.map((server) => ({
        serverId: server.serverId,
        transport: server.transport as WorkspaceMcpTransport,
        connected: server.connected,
        toolCount: server.tools.length,
        tools: server.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
        resources: server.resources,
      })),
    };
  }
}
