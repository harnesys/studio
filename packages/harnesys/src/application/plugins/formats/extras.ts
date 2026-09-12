import path from 'node:path';
import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type {
  InertSpec,
  MonitorSpec,
  PathEntrySpec,
  PluginComponent,
  PluginKind,
  SettingDefaultSpec,
} from '../../../domain/plugin-ir.ts';
import { parsePluginLspServers } from '../parse-plugin-lsp.ts';
import {
  type DiscoverContext,
  entryWarning,
  isDirectory,
  isFile,
  listDir,
  overrideDirs,
  overrideInlineObject,
  readFile,
  relativeToRoot,
} from './discover.ts';
import { isPlainObject, type PathOverrideValue } from './manifest-result.ts';

export type DiscoverExtrasOptions = {
  experimental?: Record<string, unknown>;
  lspOverride?: PathOverrideValue;
  lspServersInline?: unknown;
};

const INERT_DIRS: ReadonlyArray<readonly [string, PluginKind, string]> = [
  ['themes', 'theme', 'theme rendering is out of scope in v2'],
  ['output-styles', 'output-style', 'output styles are not rendered in v2'],
  ['workflows', 'workflow', 'workflow execution is out of scope in v2'],
  ['channels', 'channel', 'channels are out of scope in v2'],
];

/** Настройки пакета, которым плагин может задавать дефолт; остальное ignore+warning. */
const SETTING_DEFAULT_KEYS: ReadonlySet<string> = new Set(['agent', 'subagentStatusLine']);

/**
 * Хвост discovery: `monitors/monitors.json` + `experimental.monitors` (inline или путь),
 * `bin/` → path-entry, `settings.json` → setting-default (только agent/subagentStatusLine),
 * инертные каталоги (themes/output-styles/workflows/channels/evals) и LSP
 * (`.lsp.json` Claude / `lsp.json` AP + inline `lspServers`).
 */
export function discoverExtraComponents(
  ctx: DiscoverContext,
  options: DiscoverExtrasOptions,
): { components: PluginComponent[]; diagnostics: PluginDiagnostic[] } {
  const components: PluginComponent[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  discoverMonitors(ctx, options.experimental, components, diagnostics);
  discoverBin(ctx, components);
  discoverSettingDefaults(ctx, components, diagnostics);
  discoverInertKinds(ctx, options.experimental, components);
  discoverLsp(ctx, options, components, diagnostics);
  return { components, diagnostics };
}

function discoverMonitors(
  ctx: DiscoverContext,
  experimental: Record<string, unknown> | undefined,
  components: PluginComponent[],
  diagnostics: PluginDiagnostic[],
): void {
  const sources: Array<{ raw: unknown; pointer: string }> = [];
  const filePath = path.join(ctx.root, 'monitors', 'monitors.json');
  if (isFile(filePath)) {
    const content = readFile(filePath, diagnostics);
    if (content !== undefined) {
      try {
        sources.push({ raw: JSON.parse(content), pointer: 'monitors/monitors.json' });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        diagnostics.push(entryWarning(filePath, message));
      }
    }
  }
  const inline = experimental?.monitors;
  if (typeof inline === 'string') {
    const customPath = path.resolve(ctx.root, inline);
    if (isFile(customPath)) {
      const content = readFile(customPath, diagnostics);
      if (content !== undefined) {
        try {
          sources.push({ raw: JSON.parse(content), pointer: inline });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          diagnostics.push(entryWarning(customPath, message));
        }
      }
    } else {
      diagnostics.push(entryWarning(customPath, `experimental.monitors path not found: ${inline}`));
    }
  } else if (Array.isArray(inline)) {
    sources.push({ raw: inline, pointer: 'experimental.monitors' });
  } else if (inline !== undefined) {
    diagnostics.push(
      entryWarning(
        'experimental.monitors',
        'experimental.monitors must be an array or a path string',
      ),
    );
  }
  for (const source of sources) {
    const entries = normalizeMonitorEntries(source.raw);
    for (const entry of entries) {
      if (!isPlainObject(entry)) {
        diagnostics.push(entryWarning(source.pointer, 'monitor entry must be an object'));
        continue;
      }
      const name = typeof entry.name === 'string' ? entry.name : undefined;
      const command = typeof entry.command === 'string' ? entry.command : undefined;
      const description = typeof entry.description === 'string' ? entry.description : undefined;
      if (name === undefined || command === undefined || description === undefined) {
        diagnostics.push(
          entryWarning(source.pointer, 'monitor entry requires name, command and description'),
        );
        continue;
      }
      if (command.includes('${user_config.')) {
        // ${user_config.*} в monitor.command запрещён: команда вычисляется вне exec-биндера.
        components.push({
          kind: 'monitor',
          spec: { raw: entry },
          source: { file: source.pointer, pointer: name },
          status: 'dropped',
        });
        diagnostics.push({
          level: 'error',
          code: 'invalid_component',
          message: `monitor "${name}": ${'$'}{user_config.*} is not allowed in command`,
          path: source.pointer,
        });
        continue;
      }
      const spec: MonitorSpec = { name, command, description };
      if (typeof entry.when === 'string') {
        spec.when = entry.when;
      }
      components.push({
        kind: 'monitor',
        spec,
        source: { file: source.pointer, pointer: name },
        status: 'native',
      });
    }
  }
}

function normalizeMonitorEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (isPlainObject(raw) && Array.isArray(raw.monitors)) {
    return raw.monitors;
  }
  return [raw];
}

function discoverBin(ctx: DiscoverContext, components: PluginComponent[]): void {
  const binDir = path.join(ctx.root, 'bin');
  if (!isDirectory(binDir)) {
    return;
  }
  const diagnostics: PluginDiagnostic[] = [];
  const entries = listDir(binDir, diagnostics).filter((name) => isFile(path.join(binDir, name)));
  if (entries.length === 0) {
    return;
  }
  const spec: PathEntrySpec = { dir: binDir };
  components.push({
    kind: 'path-entry',
    spec,
    source: { file: 'bin/', pointer: '$' },
    status: 'native',
  });
}

function discoverSettingDefaults(
  ctx: DiscoverContext,
  components: PluginComponent[],
  diagnostics: PluginDiagnostic[],
): void {
  const filePath = path.join(ctx.root, 'settings.json');
  if (!isFile(filePath)) {
    return;
  }
  const content = readFile(filePath, diagnostics);
  if (content === undefined) {
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diagnostics.push(entryWarning(filePath, message));
    return;
  }
  if (!isPlainObject(raw)) {
    diagnostics.push(entryWarning(filePath, 'settings.json must be a JSON object'));
    return;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!SETTING_DEFAULT_KEYS.has(key)) {
      diagnostics.push({
        level: 'warning',
        code: 'unsupported_frontmatter_field',
        message: `settings.json key "${key}" is not supported and ignored`,
        path: 'settings.json',
      });
      continue;
    }
    const spec: SettingDefaultSpec = { key, value };
    components.push({
      kind: 'setting-default',
      spec,
      source: { file: 'settings.json', pointer: key },
      status: 'native',
    });
  }
}

function discoverInertKinds(
  ctx: DiscoverContext,
  experimental: Record<string, unknown> | undefined,
  components: PluginComponent[],
): void {
  for (const [dirName, kind, reason] of INERT_DIRS) {
    const dir = path.join(ctx.root, dirName);
    if (!isDirectory(dir)) {
      continue;
    }
    const spec: InertSpec = { raw: relativeToRoot(ctx.root, dir) };
    components.push({
      kind,
      spec,
      source: { file: `${dirName}/`, pointer: '$' },
      status: 'inert',
      inertReason: reason,
    });
  }
  if (experimental?.evals !== undefined) {
    const spec: InertSpec = { raw: experimental.evals };
    components.push({
      kind: 'eval',
      spec,
      source: { file: 'experimental', pointer: 'evals' },
      status: 'inert',
      inertReason: 'plugin evals are out of scope in v2',
    });
  }
}

function discoverLsp(
  ctx: DiscoverContext,
  options: DiscoverExtrasOptions,
  components: PluginComponent[],
  diagnostics: PluginDiagnostic[],
): void {
  const candidates = [
    ...overrideDirs(ctx.root, options.lspOverride),
    path.join(ctx.root, '.lsp.json'),
    path.join(ctx.root, 'lsp.json'),
  ];
  for (const filePath of candidates) {
    if (!isFile(filePath)) {
      continue;
    }
    const content = readFile(filePath, diagnostics);
    if (content === undefined) {
      continue;
    }
    try {
      addLspServers(
        JSON.parse(content),
        relativeToRoot(ctx.root, filePath),
        components,
        diagnostics,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push(entryWarning(filePath, message));
    }
    return;
  }
  if (options.lspServersInline !== undefined) {
    addLspServers(options.lspServersInline, 'lspServers (inline)', components, diagnostics);
  }
}

function addLspServers(
  raw: unknown,
  label: string,
  components: PluginComponent[],
  diagnostics: PluginDiagnostic[],
): void {
  const parsed = parsePluginLspServers(raw, label);
  diagnostics.push(...parsed.diagnostics);
  for (const spec of parsed.servers) {
    const component: PluginComponent = {
      kind: 'lsp-server',
      spec,
      source: { file: label, pointer: spec.serverId },
      status: 'native',
    };
    components.push(component);
  }
}

/** Inline-объект lspServers из path-override манифеста (Claude inline-определение). */
export function lspInlineServers(override: PathOverrideValue | undefined): unknown {
  return overrideInlineObject(override);
}
