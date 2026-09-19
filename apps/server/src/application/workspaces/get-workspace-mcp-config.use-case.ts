import type {
  ComponentOrigin,
  GrantClass,
  WorkspaceMcpConfigServer,
  WorkspaceMcpTransport,
} from '@harnesys/studio-shared';
import type { McpServerSpec, PluginComponent } from 'harnesys';
import {
  mcpEntryToFields,
  PLUGIN_SERVER_KEY_PREFIX,
  readWorkspaceMcpJson,
} from '../../adapters/mcp-json.adapter.ts';
import type {
  LoadedWorkspacePlugin,
  WorkspaceHarnesysRegistry,
} from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { componentGrantClass } from '../plugins/plugin-grant-gate.ts';

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
    private readonly pluginRepo?: PluginRepository,
  ) {}

  async execute(request: GetWorkspaceMcpConfigRequest): Promise<GetWorkspaceMcpConfigResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const raw = readWorkspaceMcpJson(workspace.path);
    const hx = await this.workspaceHarnesys.get(workspace);
    const plugins = await this.workspaceHarnesys.loadEnabledPlugins(workspace.id);
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
        origin: { kind: 'workspace' },
      });
    }

    const disabled = new Set(
      (this.pluginRepo?.listDisabledServers(workspace.id) ?? []).map(
        (entry) => `${entry.pluginName}:${entry.serverId}`,
      ),
    );

    for (const loaded of plugins) {
      servers.push(...pluginServers(loaded, live, disabled));
    }

    return { servers };
  }
}

/**
 * Карточки плагинных серверов по всем статусам IR-представления: native матчется
 * с live по ключу `plugin:<name>:<id>` (mergePluginMcpFragments), остальные живут
 * без live-статуса. Exec-поля (command/args/env/url) не отдаём: в gated-IR они
 * подставлены из userConfig и могут содержать секреты.
 */
function pluginServers(
  loaded: LoadedWorkspacePlugin,
  live: Map<string, { connected: boolean; tools: unknown[] }>,
  disabled: ReadonlySet<string>,
): WorkspaceMcpConfigServer[] {
  const originBase = { kind: 'plugin', pluginName: loaded.record.name } as const;
  const servers: WorkspaceMcpConfigServer[] = [];
  for (const component of loaded.ir.components) {
    if (component.kind !== 'mcp-server') {
      continue;
    }
    const serverId = `${PLUGIN_SERVER_KEY_PREFIX}${originBase.pluginName}:${component.source.pointer}`;
    const status = component.status;
    const specId = specServerId(component);
    const stopped =
      disabled.has(`${originBase.pluginName}:${specId}`) ||
      disabled.has(`${originBase.pluginName}:${component.source.pointer}`);
    const native = status === 'native' && !stopped;
    const snap = native ? live.get(serverId) : undefined;
    const grantClass = componentGrantClass(component, loaded.ir);
    servers.push({
      serverId,
      enabled: native,
      transport: pluginTransport(component),
      connected: native && (snap?.connected ?? false),
      toolCount: native ? (snap?.tools.length ?? 0) : 0,
      origin: {
        ...originBase,
        status,
        ...(component.inertReason !== undefined ? { inertReason: component.inertReason } : {}),
      } satisfies ComponentOrigin,
      ...(stopped ? { disabledByUser: true as const } : {}),
      ...(grantClass !== undefined ? { requiredGrant: grantClass as GrantClass } : {}),
    });
  }
  return servers;
}

function specServerId(component: PluginComponent): string {
  const spec = component.spec as Partial<McpServerSpec>;
  return typeof spec.serverId === 'string' ? spec.serverId : '';
}

function pluginTransport(component: PluginComponent): WorkspaceMcpTransport {
  const spec = component.spec as Partial<McpServerSpec> & { raw?: unknown };
  const config = spec.config;
  if (config !== undefined) {
    if (config.type === 'stdio') {
      return 'stdio';
    }
    if (config.type === 'sse') {
      return 'sse';
    }
    return 'http';
  }
  const raw = spec.raw;
  const hasUrl =
    typeof raw === 'object' && raw !== null && typeof (raw as { url?: unknown }).url === 'string';
  return hasUrl ? 'http' : 'stdio';
}
