import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PluginSourceFormat } from '../../domain/plugin.ts';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import type {
  ConfigOptionSpec,
  PluginComponent,
  PluginGrants,
  PluginIr,
} from '../../domain/plugin-ir.ts';
import type { CursorMcpJson } from '../../ports/mcp.ts';
import * as agentPlugins from './formats/agent-plugins.ts';
import { discoverAgentComponents, discoverCommandComponents } from './formats/agents-commands.ts';
import * as claudeCompat from './formats/claude-compat.ts';
import {
  type DiscoverContext,
  discoverSkillComponents,
  isDirectory,
  overrideDirs,
} from './formats/discover.ts';
import { discoverExtraComponents } from './formats/extras.ts';
import { discoverHookComponents } from './formats/hooks.ts';
import { isPlainObject } from './formats/manifest-result.ts';
import { discoverMcpComponents } from './formats/mcp.ts';

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

export type LoadPluginIrOptions = {
  root: string;
  pluginData: string;
};

export type LoadPluginIrResult = {
  ir: PluginIr;
  mcpFragment: CursorMcpJson;
  diagnostics: PluginDiagnostic[];
};

/** Layout detect → манифест (formats) → discovery (formats) → PluginIr + MCP-фрагмент. */
export function loadPluginIrFromDirectory(
  options: LoadPluginIrOptions,
): Promise<LoadPluginIrResult> {
  const root = path.resolve(options.root);
  const pluginData = path.resolve(options.pluginData);
  const listing = listRoot(root);
  const layout = detectLayout(listing);
  if (layout === 'unknown') {
    throw new UnknownPluginLayoutError(root);
  }

  const manifestPath =
    layout === 'agent-plugins'
      ? path.join(root, 'plugin.json')
      : path.join(root, '.claude-plugin', 'plugin.json');
  const rawManifest = readRequiredJson(manifestPath);
  const manifest =
    layout === 'agent-plugins'
      ? agentPlugins.parseManifest(rawManifest)
      : claudeCompat.parseManifest(rawManifest);
  const full =
    layout === 'claude-compat' ? claudeCompat.parseClaudeManifestFull(rawManifest) : undefined;

  const namespaceDir = path.join(root, HARNESYS_STUDIO_EXTENSION_DIR);
  const inventoryRoot =
    layout === 'agent-plugins' && isDirectory(namespaceDir) ? namespaceDir : root;
  const ctx: DiscoverContext = { root, pluginName: manifest.identity.name };
  const inv: DiscoverContext = { root: inventoryRoot, pluginName: manifest.identity.name };
  const overrides = manifest.pathOverrides;

  // Namespace (com.harnesys.studio/) — дом хуков/мониторов/агентов/команд AP-плагина;
  // skills, mcp.json, lsp, bin/, settings.json читаются от корня (спека §1.3).
  const skills = discoverSkillComponents(ctx, overrideDirs(root, overrides.skills));
  const commands = discoverCommandComponents(
    inv,
    overrides.commands !== undefined ? overrideDirs(inventoryRoot, overrides.commands) : undefined,
  );
  const agents = discoverAgentComponents(
    inv,
    overrides.agents !== undefined ? overrideDirs(inventoryRoot, overrides.agents) : undefined,
  );
  const hooks = discoverHookComponents(inv, {
    pluginData,
    override: overrides.hooks,
  });
  const mcp = discoverMcpComponents(ctx, {
    pluginData,
    declaredSchema: manifest.declaredSchema,
    override: overrides.mcpServers,
  });
  const extras = discoverExtraComponents(ctx, {
    experimental: full?.experimental,
    lspOverride: overrides.lspServers,
    lspServersInline: isPlainObject(rawManifest) ? rawManifest.lspServers : undefined,
  });

  const userConfig = manifest.userConfig.map((spec) => configOptionComponent(spec));
  const components: PluginComponent[] = [
    ...skills.components,
    ...commands.components,
    ...agents.components,
    ...hooks.components,
    ...mcp.components,
    ...extras.components,
    ...userConfig,
  ];
  const diagnostics: PluginDiagnostic[] = [
    ...manifest.diagnostics,
    ...skills.diagnostics,
    ...commands.diagnostics,
    ...agents.diagnostics,
    ...hooks.diagnostics,
    ...mcp.diagnostics,
    ...extras.diagnostics,
  ];

  const ir: PluginIr = {
    identity: manifest.identity,
    sourceFormat: layout,
    declaredSchema: manifest.declaredSchema,
    components,
    grants: computeGrants(components),
    diagnostics,
  };
  return Promise.resolve({ ir, mcpFragment: mcp.fragment, diagnostics });
}

function detectLayout(listing: string[]): PluginSourceFormat | 'unknown' {
  if (listing.includes('plugin.json')) {
    return 'agent-plugins';
  }
  if (listing.includes('.claude-plugin')) {
    return 'claude-compat';
  }
  return 'unknown';
}

function configOptionComponent(spec: ConfigOptionSpec): PluginComponent {
  const component: PluginComponent = {
    kind: 'config-option',
    spec,
    source: { file: 'plugin.json', pointer: spec.key },
    status: 'native',
  };
  return component;
}

function computeGrants(components: PluginComponent[]): PluginGrants {
  let needsProcess = false;
  let needsNetwork = false;
  for (const component of components) {
    if (component.status !== 'native') {
      continue;
    }
    if (isProcessComponent(component)) {
      needsProcess = true;
    }
    if (isNetworkComponent(component)) {
      needsNetwork = true;
    }
  }
  return { needsProcess, needsNetwork };
}

function isProcessComponent(component: PluginComponent): boolean {
  if (
    component.kind === 'monitor' ||
    component.kind === 'path-entry' ||
    component.kind === 'lsp-server'
  ) {
    return true;
  }
  if (component.kind === 'hook' && 'binding' in component.spec) {
    return component.spec.binding.handler.type === 'command';
  }
  if (component.kind === 'mcp-server' && 'config' in component.spec) {
    return component.spec.config.type === 'stdio';
  }
  return false;
}

function isNetworkComponent(component: PluginComponent): boolean {
  if (component.kind === 'hook' && 'binding' in component.spec) {
    return component.spec.binding.handler.type === 'http';
  }
  if (component.kind === 'mcp-server' && 'config' in component.spec) {
    return component.spec.config.type !== 'stdio';
  }
  return false;
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
