import type { WorkspaceMcpConfigServer } from '@harnesys/studio-shared';
import { mcpEntryToFields, readWorkspaceMcpJson } from '../../adapters/mcp-json.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type GetWorkspaceMcpConfigRequest = {
  workspaceId: string;
};

export type GetWorkspaceMcpConfigResponse = {
  servers: WorkspaceMcpConfigServer[];
};

export type GetWorkspaceMcpConfigInput = {
  execute(request: GetWorkspaceMcpConfigRequest): Promise<GetWorkspaceMcpConfigResponse>;
};

export class GetWorkspaceMcpConfigUseCase implements GetWorkspaceMcpConfigInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(request: GetWorkspaceMcpConfigRequest): Promise<GetWorkspaceMcpConfigResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const raw = readWorkspaceMcpJson(workspace.path);
    const hx = await this.workspaceHarnesys.get(workspace);
    const live = new Map((await hx.mcp.list()).map((s) => [s.serverId, s]));

    const servers: WorkspaceMcpConfigServer[] = [];
    for (const [serverId, entry] of Object.entries(raw)) {
      const fields = mcpEntryToFields(entry);
      const snap = live.get(serverId);
      servers.push({
        serverId,
        ...fields,
        connected: fields.enabled && (snap?.connected ?? false),
        toolCount: fields.enabled ? (snap?.tools.length ?? 0) : 0,
      });
    }

    return { servers };
  }
}
