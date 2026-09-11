import type { Stats } from 'node:fs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type {
  Plugin,
  PluginAgentRef,
  PluginCommandRef,
  PluginHookCommand,
  PluginLoadDiagnostic,
  PluginLspServer,
  PluginManifest,
  PluginMcpServer,
  PluginSourceFormat,
} from '../../domain/plugin.ts';
import type { CursorMcpJson } from '../../ports/mcp.ts';
import type { LoadPluginFromDirectoryOptions, LoadPluginResult } from '../../ports/plugins.ts';
import {
  detectPluginLayout,
  type InventoryMarkdownFields,
  parseClaudeHooksJson,
  parseClaudePluginManifestJson,
  parseInventoryMarkdown,
} from './claude-compat.ts';
import { discoverPluginSkills } from './discover-plugin-skills.ts';
import { parsePluginLspServers } from './parse-plugin-lsp.ts';
import { parsePluginManifestJson } from './parse-plugin-manifest.ts';
import { parsePluginMcpFile } from './parse-plugin-mcp.ts';

export const HARNESYS_STUDIO_EXTENSION_DIR = 'com.harnesys.studio';

export class PluginLoadError extends Error {
  readonly path?: string;

  constructor(message: string, filePath?: string) {
    super(message);
    this.name = 'PluginLoadError';
    if (filePath !== undefined) {
      this.path = filePath;
    }
  }
}

export class UnknownPluginLayoutError extends PluginLoadError {
  constructor(root: string) {
    super(`unknown plugin layout: ${root}`, root);
    this.name = 'UnknownPluginLayoutError';
  }
}

type OptionalJsonMissing = { kind: 'missing' };
type OptionalJsonOk = { kind: 'ok'; value: unknown };
type OptionalJsonInvalid = { kind: 'invalid'; message: string };
type OptionalJsonResult = OptionalJsonMissing | OptionalJsonOk | OptionalJsonInvalid;

type LoadedManifest = {
  sourceFormat: PluginSourceFormat;
  manifest: PluginManifest;
  diagnostics: PluginLoadDiagnostic[];
};

type MarkdownInventoryKind = 'agent' | 'command';

type MarkdownInventoryResult = {
  items: PluginAgentRef[];
  diagnostics: PluginLoadDiagnostic[];
};

type LoadedMcp = {
  servers: PluginMcpServer[];
  fragment: CursorMcpJson;
  diagnostics: PluginLoadDiagnostic[];
};

type LoadedHooks = {
  hooks: PluginHookCommand[];
  diagnostics: PluginLoadDiagnostic[];
};

export function loadPluginFromDirectory(
  options: LoadPluginFromDirectoryOptions,
): Promise<LoadPluginResult> {
  const root = path.resolve(options.root);
  const pluginData = path.resolve(options.pluginData);
  const rootListing = listRoot(root);
  const layout = detectPluginLayout(rootListing);
  if (layout === 'unknown') {
    throw new UnknownPluginLayoutError(root);
  }

  const loaded = loadManifest(root, layout);
  const diagnostics: PluginLoadDiagnostic[] = [...loaded.diagnostics];
  const pluginName = loaded.manifest.name;

  const skillsResult = discoverPluginSkills(root, pluginName);
  diagnostics.push(...skillsResult.diagnostics);

  const mcpResult = loadMcp(root, pluginData, pluginName);
  diagnostics.push(...mcpResult.diagnostics);

  const studioExtensionPresent = isDirectory(path.join(root, HARNESYS_STUDIO_EXTENSION_DIR));
  const inventoryRoot = studioExtensionPresent
    ? path.join(root, HARNESYS_STUDIO_EXTENSION_DIR)
    : root;

  const hooksResult = loadHooks(path.join(inventoryRoot, 'hooks', 'hooks.json'));
  diagnostics.push(...hooksResult.diagnostics);

  const agentsResult = discoverMarkdownInventory(
    path.join(inventoryRoot, 'agents'),
    pluginName,
    'agent',
  );
  diagnostics.push(...agentsResult.diagnostics);

  const commandsResult = discoverMarkdownInventory(
    path.join(inventoryRoot, 'commands'),
    pluginName,
    'command',
  );
  diagnostics.push(...commandsResult.diagnostics);

  const lspResult = loadLspServers(root, layout);
  diagnostics.push(...lspResult.diagnostics);

  const plugin: Plugin = {
    root,
    sourceFormat: loaded.sourceFormat,
    manifest: loaded.manifest,
    skills: skillsResult.skills,
    mcpServers: mcpResult.servers,
    hooks: hooksResult.hooks,
    agents: agentsResult.items,
    commands: commandsResult.items.map(toCommandRef),
    lspServers: lspResult.servers,
  };
  return Promise.resolve({ plugin, mcp: mcpResult.fragment, diagnostics });
}

function toCommandRef(item: PluginAgentRef): PluginCommandRef {
  const ref: PluginCommandRef = {
    id: item.id,
    path: item.path,
    name: item.name,
  };
  if (item.description !== undefined) {
    ref.description = item.description;
  }
  return ref;
}

function loadManifest(root: string, layout: PluginSourceFormat): LoadedManifest {
  if (layout === 'agent-plugins') {
    const manifestPath = path.join(root, 'plugin.json');
    const parsed = parsePluginManifestJson(readRequiredJson(manifestPath));
    return {
      sourceFormat: 'agent-plugins',
      manifest: parsed.manifest,
      diagnostics: ignoredFieldDiagnostics(parsed.ignoredFields, manifestPath),
    };
  }
  const manifestPath = path.join(root, '.claude-plugin', 'plugin.json');
  const parsed = parseClaudePluginManifestJson(readRequiredJson(manifestPath));
  return {
    sourceFormat: 'claude-compat',
    manifest: parsed.manifest,
    diagnostics: ignoredFieldDiagnostics(parsed.ignoredFields, manifestPath),
  };
}

function loadMcp(root: string, pluginData: string, pluginName: string): LoadedMcp {
  const emptyFragment: CursorMcpJson = { mcpServers: {} };
  const mcpPath = path.join(root, 'mcp.json');
  const json = readOptionalJson(mcpPath);
  if (json.kind === 'missing') {
    return { servers: [], fragment: emptyFragment, diagnostics: [] };
  }
  if (json.kind === 'invalid') {
    return {
      servers: [],
      fragment: emptyFragment,
      diagnostics: [
        {
          level: 'error',
          code: 'invalid_mcp_file',
          message: json.message,
          path: mcpPath,
        },
      ],
    };
  }
  const parsed = parsePluginMcpFile(json.value, {
    pluginRoot: root,
    pluginData,
    pluginName,
  });
  const servers: PluginMcpServer[] = [];
  for (const serverId of Object.keys(parsed.fragment.mcpServers)) {
    servers.push({ serverId });
  }
  const diagnostics: PluginLoadDiagnostic[] = [];
  for (const diagnostic of parsed.diagnostics) {
    diagnostics.push(withPath(diagnostic, mcpPath));
  }
  return { servers, fragment: parsed.fragment, diagnostics };
}

function loadLspServers(
  root: string,
  layout: PluginSourceFormat,
): { servers: PluginLspServer[]; diagnostics: PluginLoadDiagnostic[] } {
  const candidates =
    layout === 'claude-compat'
      ? [path.join(root, '.claude-plugin', 'plugin.json'), path.join(root, 'lsp.json')]
      : [path.join(root, 'lsp.json'), path.join(root, 'plugin.json')];
  for (const filePath of candidates) {
    const json = readOptionalJson(filePath);
    if (json.kind !== 'ok' || !isPlainObject(json.value)) {
      continue;
    }
    if (!('lspServers' in json.value) && path.basename(filePath) !== 'lsp.json') {
      continue;
    }
    const raw = path.basename(filePath) === 'lsp.json' ? json.value : json.value.lspServers;
    return parsePluginLspServers(raw, filePath);
  }
  return { servers: [], diagnostics: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadHooks(hooksFilePath: string): LoadedHooks {
  const json = readOptionalJson(hooksFilePath);
  if (json.kind === 'missing') {
    return { hooks: [], diagnostics: [] };
  }
  if (json.kind === 'invalid') {
    return {
      hooks: [],
      diagnostics: [
        {
          level: 'warning',
          code: 'invalid_hook',
          message: json.message,
          path: hooksFilePath,
        },
      ],
    };
  }
  return parseClaudeHooksJson(json.value, hooksFilePath);
}

function discoverMarkdownInventory(
  dir: string,
  pluginName: string,
  kind: MarkdownInventoryKind,
): MarkdownInventoryResult {
  const items: PluginAgentRef[] = [];
  const diagnostics: PluginLoadDiagnostic[] = [];
  const code = kind === 'agent' ? 'invalid_agent' : 'invalid_command';
  if (!isDirectory(dir)) {
    return { items, diagnostics };
  }

  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diagnostics.push({ level: 'warning', code, message, path: dir });
    return { items, diagnostics };
  }

  for (const name of names) {
    if (!name.endsWith('.md')) {
      continue;
    }
    const filePath = path.join(dir, name);
    const fileStat = tryStat(filePath);
    if (fileStat === undefined || !fileStat.isFile()) {
      continue;
    }
    const item = readMarkdownRef(filePath, name, pluginName, code);
    if ('diagnostic' in item) {
      diagnostics.push(item.diagnostic);
      continue;
    }
    items.push(item.ref);
  }
  return { items, diagnostics };
}

type MarkdownRefOk = { ref: PluginAgentRef };
type MarkdownRefFail = { diagnostic: PluginLoadDiagnostic };
type MarkdownRefResult = MarkdownRefOk | MarkdownRefFail;

function readMarkdownRef(
  filePath: string,
  fileName: string,
  pluginName: string,
  code: string,
): MarkdownRefResult {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { diagnostic: { level: 'warning', code, message, path: filePath } };
  }

  let fields: InventoryMarkdownFields;
  try {
    fields = parseInventoryMarkdown(content);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { diagnostic: { level: 'warning', code, message, path: filePath } };
  }

  const stem = path.parse(fileName).name;
  const ref: PluginAgentRef = {
    id: `${pluginName}/${stem}`,
    path: filePath,
    name: fields.name ?? stem,
  };
  if (fields.description !== undefined) {
    ref.description = fields.description;
  }
  return { ref };
}

function listRoot(root: string): string[] {
  try {
    return readdirSync(root);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new PluginLoadError(message, root);
  }
}

function readRequiredJson(filePath: string): unknown {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new PluginLoadError(message, filePath);
  }
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new PluginLoadError(message, filePath);
  }
}

function readOptionalJson(filePath: string): OptionalJsonResult {
  const fileStat = tryStat(filePath);
  if (fileStat === undefined || !fileStat.isFile()) {
    return { kind: 'missing' };
  }
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { kind: 'invalid', message };
  }
  try {
    const value: unknown = JSON.parse(text);
    return { kind: 'ok', value };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { kind: 'invalid', message };
  }
}

function ignoredFieldDiagnostics(fields: string[], manifestPath: string): PluginLoadDiagnostic[] {
  const diagnostics: PluginLoadDiagnostic[] = [];
  for (const field of fields) {
    diagnostics.push({
      level: 'warning',
      code: 'ignored_manifest_field',
      message: `ignored unknown top-level field "${field}"`,
      path: manifestPath,
    });
  }
  return diagnostics;
}

function withPath(diagnostic: PluginLoadDiagnostic, filePath: string): PluginLoadDiagnostic {
  if (diagnostic.path !== undefined) {
    return diagnostic;
  }
  return { ...diagnostic, path: filePath };
}

function isDirectory(absPath: string): boolean {
  return tryStat(absPath)?.isDirectory() === true;
}

function tryStat(target: string): Stats | undefined {
  try {
    return statSync(target);
  } catch {
    return undefined;
  }
}
