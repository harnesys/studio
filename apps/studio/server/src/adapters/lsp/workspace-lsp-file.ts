import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LspServerSpec, PluginDiagnostic } from 'harnesys';

/** Workspace-local LSP SoT: `<workspace>/.harnesys/lsp.json` (spec §1). */
export const WORKSPACE_LSP_PATH = '.harnesys/lsp.json';

export type WorkspaceLspFile = {
  raw: unknown;
  servers: LspServerSpec[];
  diagnostics: PluginDiagnostic[];
};

/** Origin tag for the merged resolve (spec §1); the LSP controller reuses it. */
export type WorkspaceLspOrigin = 'file' | `plugin:${string}`;

export type WorkspaceLspServer = LspServerSpec & { origin: WorkspaceLspOrigin };

export type WorkspacePluginLspServer = { spec: LspServerSpec; pluginName: string };

/**
 * Read the workspace LSP file. Missing file = empty list, no error.
 * Invalid JSON surfaces as `server_config_invalid`. `disabled: true`
 * entries are excluded from resolve (spec §1); the raw file keeps them
 * so the controller can report the flag.
 */
export function readWorkspaceLspFile(root: string): WorkspaceLspFile {
  const path = join(root, WORKSPACE_LSP_PATH);
  if (!existsSync(path)) {
    return { raw: {}, servers: [], diagnostics: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    return {
      raw: {},
      servers: [],
      diagnostics: [
        {
          level: 'error',
          code: 'server_config_invalid',
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          path: WORKSPACE_LSP_PATH,
        },
      ],
    };
  }
  const record = isRecord(raw) ? (raw.servers ?? raw) : raw;
  const parsed = parseWorkspaceLspServers(record);
  const servers = parsed.servers.filter((spec) => !isDisabled(record, spec.serverId));
  return { raw, servers, diagnostics: parsed.diagnostics };
}

/**
 * Validate + write the workspace LSP file. Rejects when any entry is
 * invalid (missing command, non-object entry); `disabled` entries are
 * accepted, they are exclusion flags, not errors.
 */
export async function writeWorkspaceLspFile(root: string, raw: unknown): Promise<void> {
  const record = isRecord(raw) ? (raw.servers ?? raw) : raw;
  const parsed = parseWorkspaceLspServers(record);
  if (parsed.diagnostics.length > 0) {
    const details = parsed.diagnostics
      .map((diagnostic) => `${diagnostic.path ?? WORKSPACE_LSP_PATH}: ${diagnostic.message}`)
      .join('; ');
    throw new Error(`invalid workspace LSP config: ${details}`);
  }
  await mkdir(join(root, '.harnesys'), { recursive: true });
  await writeFile(join(root, WORKSPACE_LSP_PATH), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

/**
 * Merged resolve per cwd: file servers first, then plugin `lsp-server`
 * components. First wins per extension in the adapter dedupe (`lsp_shadowed`
 * for the losers). Single merge site shared by the host and the controller.
 */
export function resolveWorkspaceLsp(
  root: string,
  pluginServers: WorkspacePluginLspServer[],
): WorkspaceLspServer[] {
  const file = readWorkspaceLspFile(root);
  return [
    ...file.servers.map((spec): WorkspaceLspServer => ({ ...spec, origin: 'file' })),
    ...pluginServers.map(
      ({ spec, pluginName }): WorkspaceLspServer => ({ ...spec, origin: `plugin:${pluginName}` }),
    ),
  ];
}

function parseWorkspaceLspServers(record: unknown): {
  servers: LspServerSpec[];
  diagnostics: PluginDiagnostic[];
} {
  const diagnostics: PluginDiagnostic[] = [];
  const servers: LspServerSpec[] = [];
  if (record === undefined || record === null) {
    return { servers, diagnostics };
  }
  if (!isRecord(record)) {
    diagnostics.push(invalid('lspServers must be an object'));
    return { servers, diagnostics };
  }
  for (const [serverId, entry] of Object.entries(record)) {
    if (!isRecord(entry)) {
      diagnostics.push(invalid(`lspServers.${serverId} must be an object`));
      continue;
    }
    const command = typeof entry.command === 'string' ? entry.command.trim() : '';
    if (command.length === 0) {
      diagnostics.push(invalid(`lspServers.${serverId} requires command`));
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
    } else if (entry.transport !== undefined) {
      diagnostics.push(invalid(`lspServers.${serverId} has unsupported transport`));
      continue;
    }
    if (entry.env !== undefined) {
      if (!isRecord(entry.env)) {
        diagnostics.push(invalid(`lspServers.${serverId} env must be an object`));
        continue;
      }
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

function invalid(message: string): PluginDiagnostic {
  return { level: 'error', code: 'server_config_invalid', message, path: WORKSPACE_LSP_PATH };
}

function optionalMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isDisabled(record: unknown, serverId: string): boolean {
  if (!isRecord(record)) {
    return false;
  }
  const entry = record[serverId];
  return isRecord(entry) && entry.disabled === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
