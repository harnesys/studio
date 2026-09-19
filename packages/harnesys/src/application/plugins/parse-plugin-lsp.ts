import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import type { LspServerSpec } from '../../domain/plugin-ir.ts';
export type ParsePluginLspResult = {
  servers: LspServerSpec[];
  diagnostics: PluginDiagnostic[];
};
export function parsePluginLspServers(raw: unknown, sourcePath?: string): ParsePluginLspResult {
  const diagnostics: PluginDiagnostic[] = [];
  const servers: LspServerSpec[] = [];
  if (raw === undefined || raw === null) {
    return { servers, diagnostics };
  }
  if (!isRecord(raw)) {
    diagnostics.push(lspWarning('lspServers must be an object', sourcePath));
    return { servers, diagnostics };
  }
  for (const [serverId, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) {
      diagnostics.push(lspWarning(`lspServers.${serverId} must be an object`, sourcePath));
      continue;
    }
    const command = typeof entry.command === 'string' ? entry.command.trim() : '';
    if (command.length === 0) {
      diagnostics.push(lspWarning(`lspServers.${serverId} requires command`, sourcePath));
      continue;
    }
    const extensionToLanguage: Record<string, string> = {};
    if (isRecord(entry.extensionToLanguage)) {
      for (const [ext, languageId] of Object.entries(entry.extensionToLanguage)) {
        if (typeof languageId === 'string' && languageId.trim().length > 0) {
          const key = ext.startsWith('.') ? ext : `.${ext}`;
          extensionToLanguage[key] = languageId.trim();
        }
      }
    }
    const spec: LspServerSpec = { serverId, command, extensionToLanguage };
    if (Array.isArray(entry.args)) {
      spec.args = entry.args.filter((item): item is string => typeof item === 'string');
    }
    if (entry.transport === 'stdio' || entry.transport === 'socket') {
      spec.transport = entry.transport;
    }
    if (isRecord(entry.env)) {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(entry.env)) {
        if (typeof value === 'string') {
          env[key] = value;
        }
      }
      spec.env = env;
    }
    if (entry.initializationOptions !== undefined) {
      spec.initializationOptions = entry.initializationOptions;
    }
    if (entry.settings !== undefined) {
      spec.settings = entry.settings;
    }
    if (typeof entry.workspaceFolder === 'string') {
      spec.workspaceFolder = entry.workspaceFolder;
    }
    const startup = optionalMs(entry.startupTimeoutMs ?? entry.startupTimeout);
    if (startup !== undefined) {
      spec.startupTimeoutMs = startup;
    }
    const shutdown = optionalMs(entry.shutdownTimeoutMs ?? entry.shutdownTimeout);
    if (shutdown !== undefined) {
      spec.shutdownTimeoutMs = shutdown;
    }
    if (typeof entry.restartOnCrash === 'boolean') {
      spec.restartOnCrash = entry.restartOnCrash;
    }
    const restarts = optionalMs(entry.maxRestarts);
    if (restarts !== undefined) {
      spec.maxRestarts = restarts;
    }
    if (typeof entry.diagnostics === 'boolean') {
      spec.diagnostics = entry.diagnostics;
    }
    servers.push(spec);
  }
  return { servers, diagnostics };
}
function lspWarning(message: string, sourcePath: string | undefined): PluginDiagnostic {
  const diagnostic: PluginDiagnostic = {
    level: 'warning',
    code: 'server_config_invalid',
    message,
  };
  if (sourcePath !== undefined) {
    diagnostic.path = sourcePath;
  }
  return diagnostic;
}
function optionalMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
