import type { McpServerSpec, PluginComponent } from 'harnesys';
import {
  isPluginServerKey,
  PLUGIN_SERVER_KEY_PREFIX,
  readWorkspaceMcpJson,
  writeWorkspaceMcpJson,
} from '../../adapters/mcp-json.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type {
  GetWorkspaceMcpConfigInput,
  GetWorkspaceMcpConfigResponse,
} from './get-workspace-mcp-config.use-case.ts';

export type SetMcpServerStateRequest = {
  workspaceId: string;
  serverId: string;
  enabled: boolean;
};

export type SetMcpServerStateResponse = GetWorkspaceMcpConfigResponse;

export type SetMcpServerStateInput = {
  execute(request: SetMcpServerStateRequest): Promise<SetMcpServerStateResponse>;
};

/**
 * Single on/off switch for both server kinds. Workspace servers persist
 * `enabled` in `.harnesys/mcp.json`; plugin servers persist a per-workspace
 * disabled row (approval and grants are kept, so re-enable is instant).
 */
export class SetMcpServerStateUseCase implements SetMcpServerStateInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly plugins: PluginRepository,
    private readonly getConfig: GetWorkspaceMcpConfigInput,
  ) {}

  async execute(request: SetMcpServerStateRequest): Promise<SetMcpServerStateResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    if (isPluginServerKey(request.serverId)) {
      await this.setPluginState(request.workspaceId, request.serverId, request.enabled);
    } else {
      this.setWorkspaceState(workspace.path, request.serverId, request.enabled);
    }
    await this.workspaceHarnesys.invalidate(workspace.id);
    return this.getConfig.execute({ workspaceId: request.workspaceId });
  }

  private async setPluginState(
    workspaceId: string,
    serverId: string,
    enabled: boolean,
  ): Promise<void> {
    const pluginName = serverId.slice(PLUGIN_SERVER_KEY_PREFIX.length).split(':')[0] ?? '';
    const pointer = serverId.slice(`${PLUGIN_SERVER_KEY_PREFIX}${pluginName}:`.length);
    const record = this.plugins.findByName(pluginName);
    if (!record) {
      throw new NotFoundError(`plugin ${pluginName} not found`);
    }
    if (!record.enabledWorkspaceIds.includes(workspaceId)) {
      throw new ValidationError(`plugin ${pluginName} is not enabled in this workspace`);
    }
    const specId = await this.resolveSpecId(workspaceId, pluginName, pointer);
    this.plugins.setServerDisabled(pluginName, specId, workspaceId, !enabled);
  }

  /** Approval rows are keyed by spec.serverId; fall back to the config-key pointer. */
  private async resolveSpecId(
    workspaceId: string,
    pluginName: string,
    pointer: string,
  ): Promise<string> {
    const loaded = await this.workspaceHarnesys.loadEnabledPlugins(workspaceId);
    const entry = loaded.find((item) => item.record.name === pluginName);
    const component = entry?.ir.components.find(
      (item): item is PluginComponent & { spec: McpServerSpec } =>
        item.kind === 'mcp-server' && item.source.pointer === pointer,
    );
    return component?.spec.serverId ?? pointer;
  }

  private setWorkspaceState(workspacePath: string, serverId: string, enabled: boolean): void {
    const map = readWorkspaceMcpJson(workspacePath);
    const entry = map[serverId];
    if (!entry) {
      throw new NotFoundError(`mcp server ${serverId} not found`);
    }
    if (enabled) {
      const { enabled: _ignored, ...rest } = entry;
      map[serverId] = rest;
    } else {
      map[serverId] = { ...entry, enabled: false };
    }
    writeWorkspaceMcpJson(workspacePath, map);
  }
}
