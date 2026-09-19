import type {
  UpsertWorkspaceMcpServerRequest,
  WorkspaceMcpConfigServer,
} from '@harnesys/studio-shared';
import {
  fieldsToMcpEntry,
  isPluginServerKey,
  mcpEntryToFields,
  readWorkspaceMcpJson,
  writeWorkspaceMcpJson,
} from '../../adapters/mcp-json.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type UpsertWorkspaceMcpServerUseCaseRequest = UpsertWorkspaceMcpServerRequest & {
  workspaceId: string;
  serverId: string;
};

export type UpsertWorkspaceMcpServerResponse = {
  server: WorkspaceMcpConfigServer;
};

export type UpsertWorkspaceMcpServerInput = {
  execute(
    request: UpsertWorkspaceMcpServerUseCaseRequest,
  ): Promise<UpsertWorkspaceMcpServerResponse>;
};

export class UpsertWorkspaceMcpServerUseCase implements UpsertWorkspaceMcpServerInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
  ) {}

  async execute(
    request: UpsertWorkspaceMcpServerUseCaseRequest,
  ): Promise<UpsertWorkspaceMcpServerResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    if (isPluginServerKey(request.serverId)) {
      throw new ValidationError(`mcp server ${request.serverId} belongs to a plugin`);
    }

    const map = readWorkspaceMcpJson(workspace.path);
    const entry = fieldsToMcpEntry({
      transport: request.transport,
      ...(request.enabled !== undefined ? { enabled: request.enabled } : {}),
      ...(request.command !== undefined ? { command: request.command } : {}),
      ...(request.args !== undefined ? { args: request.args } : {}),
      ...(request.env !== undefined ? { env: request.env } : {}),
      ...(request.url !== undefined ? { url: request.url } : {}),
      ...(request.headers !== undefined ? { headers: request.headers } : {}),
    });
    map[request.serverId] = entry;
    writeWorkspaceMcpJson(workspace.path, map);

    await this.workspaceHarnesys.invalidate(workspace.id);
    const hx = await this.workspaceHarnesys.get(workspace);
    const fields = mcpEntryToFields(entry);
    const snap = (await hx.mcp.list()).find((s) => s.serverId === request.serverId);

    return {
      server: {
        serverId: request.serverId,
        ...fields,
        connected: fields.enabled && (snap?.connected ?? false),
        toolCount: fields.enabled ? (snap?.tools.length ?? 0) : 0,
        origin: { kind: 'workspace' },
      },
    };
  }
}
