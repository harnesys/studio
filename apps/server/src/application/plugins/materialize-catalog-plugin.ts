import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginDiagnostic } from '@harnesys/studio-shared';
import type { CatalogEntry, CatalogRenames } from 'harnesys/plugins-catalog';
import { findMarketplaceManifest, parseClaudeMarketplace } from 'harnesys/plugins-catalog';
import type { PluginRegistryRepository } from '../../domain/plugin-registry.port.ts';

type MaterializeComponentField =
  | 'skills'
  | 'commands'
  | 'agents'
  | 'hooks'
  | 'mcpServers'
  | 'lspServers';
const COMPONENT_FIELDS: MaterializeComponentField[] = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcpServers',
  'lspServers',
];
const RENAMES_CHAIN_MAX = 10;
export type CatalogPluginMaterializeMeta = {
  name: string;
  description?: string;
  version?: string;
  strict?: boolean;
  components?: Partial<Record<MaterializeComponentField, unknown>>;
};
export type CatalogPluginMaterializeResult = {
  materialized: boolean;
  wroteLspServers: boolean;
  replacedByEntry: boolean;
};
export async function materializeCatalogPluginIfNeeded(
  checkout: string,
  meta: CatalogPluginMaterializeMeta,
): Promise<CatalogPluginMaterializeResult> {
  if (meta.strict === false) {
    return replaceManifestFromEntry(checkout, meta);
  }
  const manifestPath = join(checkout, '.claude-plugin', 'plugin.json');
  const hasLayout = hasRecognizedPluginLayout(checkout);
  const existing = hasLayout && existsSync(manifestPath) ? readJsonObject(manifestPath) : undefined;
  const lsp = meta.components?.lspServers;
  const needsLsp = lsp !== undefined && (existing === undefined || !isRecord(existing.lspServers));
  if (hasLayout && !needsLsp) {
    return { materialized: false, wroteLspServers: false, replacedByEntry: false };
  }
  const dir = join(checkout, '.claude-plugin');
  await mkdir(dir, { recursive: true });
  const manifest: Record<string, unknown> = {
    ...(existing ?? {}),
    name: meta.name,
  };
  if (meta.description) {
    manifest.description = meta.description;
  }
  if (meta.version) {
    manifest.version = meta.version;
  }
  if (lsp !== undefined) {
    manifest.lspServers = lsp;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {
    materialized: !hasLayout,
    wroteLspServers: lsp !== undefined,
    replacedByEntry: false,
  };
}
async function replaceManifestFromEntry(
  checkout: string,
  meta: CatalogPluginMaterializeMeta,
): Promise<CatalogPluginMaterializeResult> {
  const manifestPath = join(checkout, '.claude-plugin', 'plugin.json');
  const hasLayout = hasRecognizedPluginLayout(checkout);
  const existing = hasLayout && existsSync(manifestPath) ? readJsonObject(manifestPath) : undefined;
  const manifest: Record<string, unknown> = { name: meta.name };
  if (meta.description) {
    manifest.description = meta.description;
  }
  if (meta.version) {
    manifest.version = meta.version;
  }
  for (const field of COMPONENT_FIELDS) {
    const value = meta.components?.[field];
    if (value !== undefined) {
      manifest[field] = value;
    }
  }
  if (existing && stableStringify(existing) === stableStringify(manifest)) {
    return { materialized: false, wroteLspServers: false, replacedByEntry: false };
  }
  await mkdir(join(checkout, '.claude-plugin'), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {
    materialized: !hasLayout,
    wroteLspServers: meta.components?.lspServers !== undefined,
    replacedByEntry: hasLayout,
  };
}
export async function prepareCatalogCheckout(
  checkout: string,
  marketplaceRoot: string,
  pluginName: string,
): Promise<PluginDiagnostic[]> {
  const meta = readMarketplacePluginMeta(marketplaceRoot, pluginName);
  const materialize = await materializeCatalogPluginIfNeeded(checkout, meta);
  const diagnostics: PluginDiagnostic[] = [];
  if (materialize.materialized) {
    diagnostics.push({
      level: 'warning',
      code: 'unknown_manifest_field',
      message:
        'Plugin directory had no plugin.json; synthesized .claude-plugin/plugin.json from marketplace entry (Claude strict:false).',
      path: checkout,
    });
  } else if (materialize.replacedByEntry) {
    diagnostics.push({
      level: 'warning',
      code: 'unknown_manifest_field',
      message:
        'Marketplace entry strict:false is the plugin definition; .claude-plugin/plugin.json was rebuilt from entry fields.',
      path: checkout,
    });
  }
  return diagnostics;
}
export function readMarketplacePluginMeta(
  marketplaceRoot: string,
  pluginName: string,
): CatalogPluginMaterializeMeta {
  const location = findMarketplaceManifest(marketplaceRoot);
  if (!location) {
    return { name: pluginName };
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(location.manifestPath, 'utf8'));
    if (!isRecord(raw) || !Array.isArray(raw.plugins)) {
      return { name: pluginName };
    }
    for (const item of raw.plugins) {
      if (!isRecord(item) || item.name !== pluginName) {
        continue;
      }
      const description = asString(item.description);
      const version = asString(item.version);
      const components = readEntryComponents(item);
      return {
        name: pluginName,
        ...(item.strict === false ? { strict: false } : {}),
        ...(description ? { description } : {}),
        ...(version ? { version } : {}),
        ...(components ? { components } : {}),
      };
    }
  } catch {}
  return { name: pluginName };
}
function readEntryComponents(
  entry: Record<string, unknown>,
): Partial<Record<MaterializeComponentField, unknown>> | undefined {
  const components: Partial<Record<MaterializeComponentField, unknown>> = {};
  for (const field of COMPONENT_FIELDS) {
    const value = entry[field];
    if (value !== undefined && value !== null) {
      components[field] = value;
    }
  }
  return Object.keys(components).length > 0 ? components : undefined;
}
export function findCatalogEntryWithRenames(
  registries: PluginRegistryRepository,
  registryId: string,
  pluginName: string,
): CatalogEntry | undefined {
  const direct = registries.findCatalogEntry(registryId, pluginName);
  if (direct) {
    return direct;
  }
  const registry = registries.findById(registryId);
  if (!registry) {
    return undefined;
  }
  const renames = readMarketplaceRenames(registry.path);
  if (!renames) {
    return undefined;
  }
  let current = pluginName;
  for (let hop = 0; hop < RENAMES_CHAIN_MAX; hop += 1) {
    const next = renames[current];
    if (next === undefined || next === null) {
      return undefined;
    }
    current = next;
    const entry = registries.findCatalogEntry(registryId, current);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}
function readMarketplaceRenames(marketplaceRoot: string): CatalogRenames | undefined {
  const location = findMarketplaceManifest(marketplaceRoot);
  if (!location) {
    return undefined;
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(location.manifestPath, 'utf8'));
    return parseClaudeMarketplace(raw, { rootHint: location.root }).renames;
  } catch {
    return undefined;
  }
}
export type CatalogVersionInput = {
  entry: CatalogEntry;
  manifestVersion?: string;
  registryRevision?: string;
  sourceRevision?: string;
};
export function resolveCatalogEntryVersion(input: CatalogVersionInput): string {
  if (input.manifestVersion) {
    return input.manifestVersion;
  }
  if (input.entry.version) {
    return input.entry.version;
  }
  const source = input.entry.installSource;
  const gitBacked =
    source === undefined ||
    source.type === 'relative' ||
    source.type === 'github' ||
    source.type === 'url' ||
    source.type === 'git-subdir';
  if (gitBacked && input.registryRevision) {
    return input.registryRevision;
  }
  if (source?.type === 'archive' && source.sha256) {
    return source.sha256.slice(0, 12);
  }
  if (input.sourceRevision) {
    return input.sourceRevision;
  }
  return 'unknown';
}
function hasRecognizedPluginLayout(checkout: string): boolean {
  return (
    existsSync(join(checkout, 'plugin.json')) ||
    existsSync(join(checkout, '.claude-plugin', 'plugin.json'))
  );
}
export function readPluginManifestVersion(checkout: string): string | undefined {
  const nested = join(checkout, '.claude-plugin', 'plugin.json');
  const root = join(checkout, 'plugin.json');
  let manifest: Record<string, unknown> | undefined;
  if (existsSync(nested)) {
    manifest = readJsonObject(nested);
  } else if (existsSync(root)) {
    manifest = readJsonObject(root);
  }
  return asString(manifest?.version);
}
function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return isRecord(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
