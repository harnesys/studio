import type { WorkspaceLspEntry, WorkspaceLspListResponse } from '@harnesys/studio-shared';
import type { LspServerSpec, PluginComponent } from 'harnesys';
import { hasBinary } from '../../adapters/lsp/effective-path.ts';
import {
  readWorkspaceLspFile,
  resolveWorkspaceLsp,
  type WorkspacePluginLspServer,
} from '../../adapters/lsp/workspace-lsp-file.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { PluginRepository } from '../../domain/plugin.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { pluginUserConfig, substituteLspSpec } from '../plugins/plugin-user-config.ts';
export type LspStatusRequest = {
  workspaceId: string;
};
export type LspStatusResponse = WorkspaceLspListResponse;
export type LspStatusInput = {
  execute(request: LspStatusRequest): Promise<LspStatusResponse>;
};
export class LspStatusUseCase implements LspStatusInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly pluginRepo?: PluginRepository,
    private readonly lspErrors?: (cwd: string) => Record<string, string>,
  ) {}
  async execute(request: LspStatusRequest): Promise<LspStatusResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const file = readWorkspaceLspFile(workspace.path);
    const loaded = await this.workspaceHarnesys.loadEnabledPlugins(workspace.id);
    const nativePluginServers: WorkspacePluginLspServer[] = [];
    const blocked: {
      spec: LspServerSpec;
      pluginName: string;
    }[] = [];
    for (const entry of loaded) {
      const userConfig = pluginUserConfig(entry.ir, entry.record.options);
      for (const component of entry.ir.components) {
        if (component.kind !== 'lsp-server' || !isLspSpec(component)) {
          continue;
        }
        if (component.status !== 'native') {
          blocked.push({ spec: component.spec, pluginName: entry.ir.identity.name });
          continue;
        }
        const substituted = substituteLspSpec(component.spec, userConfig);
        if ('message' in substituted) {
          continue;
        }
        nativePluginServers.push({ spec: substituted, pluginName: entry.ir.identity.name });
      }
    }
    const merged = resolveWorkspaceLsp(workspace.path, nativePluginServers);
    const errors = this.lspErrors?.(workspace.path) ?? {};
    const servers: WorkspaceLspEntry[] = merged.map((server) =>
      this.toEntry(server, {
        disabled: isDisabledServer(this.pluginRepo, server, workspace.id, file.raw),
        granted: true,
        lastError: errors[server.serverId],
      }),
    );
    for (const entry of blocked) {
      servers.push(
        this.toEntry(
          { ...entry.spec, origin: `plugin:${entry.pluginName}` },
          {
            disabled: this.pluginRepo?.isServerDisabled(
              entry.pluginName,
              entry.spec.serverId,
              workspace.id,
            ),
            granted: false,
          },
        ),
      );
    }
    for (const entry of disabledFileEntries(file.raw)) {
      if (
        servers.some((server) => server.serverId === entry.serverId && server.origin === 'file')
      ) {
        continue;
      }
      servers.push(this.toEntry({ ...entry, origin: 'file' }, { disabled: true, granted: true }));
    }
    return { servers, diagnostics: file.diagnostics };
  }
  private toEntry(
    server: LspServerSpec & {
      origin: string;
    },
    flags: {
      disabled?: boolean;
      granted: boolean;
      lastError?: string;
    },
  ): WorkspaceLspEntry {
    const disabled = flags.disabled ?? false;
    const binaryOk = hasBinary(server.command);
    let status: 'live' | 'off' | 'error' = 'live';
    if (disabled || !flags.granted) {
      status = 'off';
    } else if (!binaryOk || flags.lastError !== undefined) {
      status = 'error';
    }
    return {
      serverId: server.serverId,
      origin: server.origin,
      command: server.command,
      ...(server.args !== undefined ? { args: server.args } : {}),
      extensionToLanguage: server.extensionToLanguage,
      disabled,
      granted: flags.granted,
      binaryOk,
      status,
      ...(flags.lastError !== undefined ? { lastError: flags.lastError } : {}),
    };
  }
}
function isLspSpec(component: PluginComponent): component is PluginComponent & {
  spec: LspServerSpec;
} {
  return 'command' in component.spec && 'extensionToLanguage' in component.spec;
}
function isDisabledServer(
  pluginRepo: PluginRepository | undefined,
  server: {
    serverId: string;
    origin: string;
  },
  workspaceId: string,
  raw: unknown,
): boolean {
  if (server.origin === 'file') {
    return isFileDisabled(raw, server.serverId);
  }
  if (!server.origin.startsWith('plugin:')) {
    return false;
  }
  const pluginName = server.origin.slice('plugin:'.length);
  return pluginRepo?.isServerDisabled(pluginName, server.serverId, workspaceId) ?? false;
}
function isFileDisabled(raw: unknown, serverId: string): boolean {
  const record = containerOf(raw);
  if (!record) {
    return false;
  }
  const entry = record[serverId];
  return isRecord(entry) && entry.disabled === true;
}
function disabledFileEntries(raw: unknown): LspServerSpec[] {
  const record = containerOf(raw);
  if (!record) {
    return [];
  }
  const servers: LspServerSpec[] = [];
  for (const [serverId, value] of Object.entries(record)) {
    if (!isRecord(value) || value.disabled !== true) {
      continue;
    }
    const command = typeof value.command === 'string' ? value.command.trim() : '';
    if (command.length === 0) {
      continue;
    }
    const extensionToLanguage: Record<string, string> = {};
    if (isRecord(value.extensionToLanguage)) {
      for (const [ext, languageId] of Object.entries(value.extensionToLanguage)) {
        if (typeof languageId === 'string' && languageId.trim().length > 0) {
          const key = ext.startsWith('.') ? ext : `.${ext}`;
          extensionToLanguage[key] = languageId.trim();
        }
      }
    }
    const spec: LspServerSpec = { serverId, command, extensionToLanguage };
    if (Array.isArray(value.args)) {
      spec.args = value.args.filter((item): item is string => typeof item === 'string');
    }
    servers.push(spec);
  }
  return servers;
}
function containerOf(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const inner = raw.servers;
  if (inner !== undefined) {
    return isRecord(inner) ? inner : undefined;
  }
  return raw;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
