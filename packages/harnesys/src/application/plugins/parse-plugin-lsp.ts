import type { PluginLoadDiagnostic, PluginLspServer } from '../../domain/plugin.ts';

export type ParsePluginLspResult = {
  servers: PluginLspServer[];
  diagnostics: PluginLoadDiagnostic[];
};

/**
 * Parse Claude-style `lspServers` map from plugin.json or marketplace entry.
 * Shape: { [serverId]: { command, args?, extensionToLanguage } }
 */
export function parsePluginLspServers(raw: unknown, sourcePath?: string): ParsePluginLspResult {
  const diagnostics: PluginLoadDiagnostic[] = [];
  const servers: PluginLspServer[] = [];
  if (raw === undefined || raw === null) {
    return { servers, diagnostics };
  }
  if (!isRecord(raw)) {
    diagnostics.push({
      level: 'warning',
      code: 'invalid_lsp_servers',
      message: 'lspServers must be an object',
      ...(sourcePath ? { path: sourcePath } : {}),
    });
    return { servers, diagnostics };
  }
  for (const [serverId, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) {
      diagnostics.push({
        level: 'warning',
        code: 'invalid_lsp_servers',
        message: `lspServers.${serverId} must be an object`,
        ...(sourcePath ? { path: sourcePath } : {}),
      });
      continue;
    }
    const command = typeof entry.command === 'string' ? entry.command.trim() : '';
    if (command.length === 0) {
      diagnostics.push({
        level: 'warning',
        code: 'invalid_lsp_servers',
        message: `lspServers.${serverId} requires command`,
        ...(sourcePath ? { path: sourcePath } : {}),
      });
      continue;
    }
    const args = Array.isArray(entry.args)
      ? entry.args.filter((item): item is string => typeof item === 'string')
      : [];
    const extensionToLanguage: Record<string, string> = {};
    if (isRecord(entry.extensionToLanguage)) {
      for (const [ext, languageId] of Object.entries(entry.extensionToLanguage)) {
        if (typeof languageId === 'string' && languageId.trim().length > 0) {
          const key = ext.startsWith('.') ? ext : `.${ext}`;
          extensionToLanguage[key] = languageId.trim();
        }
      }
    }
    servers.push({
      serverId,
      command,
      args,
      extensionToLanguage,
    });
  }
  return { servers, diagnostics };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
