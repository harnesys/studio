import {
  isPluginServerKey,
  PLUGIN_SERVER_KEY_PREFIX,
  readWorkspaceMcpJson,
} from '../../adapters/mcp-json.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type {
  GetWorkspaceMcpConfigInput,
  GetWorkspaceMcpConfigResponse,
} from './get-workspace-mcp-config.use-case.ts';
export type RestartMcpServerRequest = {
  workspaceId: string;
  serverId: string;
};
export type RestartMcpServerResponse = GetWorkspaceMcpConfigResponse;
export type RestartMcpServerInput = {
  execute(request: RestartMcpServerRequest): Promise<RestartMcpServerResponse>;
};
export class RestartMcpServerUseCase implements RestartMcpServerInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly getConfig: GetWorkspaceMcpConfigInput,
  ) {}
  async execute(request: RestartMcpServerRequest): Promise<RestartMcpServerResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    await this.assertServerExists(request.workspaceId, workspace.path, request.serverId);
    await this.workspaceHarnesys.invalidate(workspace.id);
    return this.getConfig.execute({ workspaceId: request.workspaceId });
  }
  private async assertServerExists(
    workspaceId: string,
    workspacePath: string,
    serverId: string,
  ): Promise<void> {
    if (isPluginServerKey(serverId)) {
      const pluginName = serverId.slice(PLUGIN_SERVER_KEY_PREFIX.length).split(':')[0] ?? '';
      const pointer = serverId.slice(`${PLUGIN_SERVER_KEY_PREFIX}${pluginName}:`.length);
      const loaded = await this.workspaceHarnesys.loadEnabledPlugins(workspaceId);
      const known = loaded.some(
        (entry) =>
          entry.record.name === pluginName &&
          entry.ir.components.some(
            (component) => component.kind === 'mcp-server' && component.source.pointer === pointer,
          ),
      );
      if (!known) {
        throw new NotFoundError(`mcp server ${serverId} not found`);
      }
      return;
    }
    if (!(serverId in readWorkspaceMcpJson(workspacePath))) {
      throw new NotFoundError(`mcp server ${serverId} not found`);
    }
  }
}
