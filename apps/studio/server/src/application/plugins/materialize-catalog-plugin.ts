import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginLoadDiagnostic } from '@harnesys/studio-shared';
import { findMarketplaceManifest } from 'harnesys/plugins-catalog';

export type CatalogPluginMaterializeMeta = {
  name: string;
  description?: string;
  version?: string;
  lspServers?: Record<string, unknown>;
};

/**
 * Claude `strict: false` entries (e.g. typescript-lsp) keep identity/components in
 * marketplace.json; the relative path may only contain LICENSE/README. Synthesize or
 * enrich `.claude-plugin/plugin.json` (including lspServers) from the catalog entry.
 */
export async function materializeCatalogPluginIfNeeded(
  checkout: string,
  meta: CatalogPluginMaterializeMeta,
): Promise<{ materialized: boolean; wroteLspServers: boolean }> {
  const manifestPath = join(checkout, '.claude-plugin', 'plugin.json');
  const hasLayout = hasRecognizedPluginLayout(checkout);
  const existing = hasLayout && existsSync(manifestPath) ? readJsonObject(manifestPath) : undefined;
  const needsLsp =
    meta.lspServers !== undefined && (existing === undefined || !isRecord(existing.lspServers));
  if (hasLayout && !needsLsp) {
    return { materialized: false, wroteLspServers: false };
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
  if (meta.lspServers) {
    manifest.lspServers = meta.lspServers;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {
    materialized: !hasLayout,
    wroteLspServers: Boolean(meta.lspServers),
  };
}

/** Materialize from marketplace root + collect install diagnostics. */
export async function prepareCatalogCheckout(
  checkout: string,
  marketplaceRoot: string,
  pluginName: string,
): Promise<PluginLoadDiagnostic[]> {
  const meta = readMarketplacePluginMeta(marketplaceRoot, pluginName);
  const materialize = await materializeCatalogPluginIfNeeded(checkout, meta);
  const diagnostics: PluginLoadDiagnostic[] = [];
  if (materialize.materialized) {
    diagnostics.push({
      level: 'warning',
      code: 'catalog_manifest_materialized',
      message:
        'Plugin directory had no plugin.json; synthesized .claude-plugin/plugin.json from marketplace entry (Claude strict:false).',
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
      return {
        name: pluginName,
        ...(description ? { description } : {}),
        ...(version ? { version } : {}),
        ...(isRecord(item.lspServers) ? { lspServers: item.lspServers } : {}),
      };
    }
  } catch {
    // fall through
  }
  return { name: pluginName };
}

function hasRecognizedPluginLayout(checkout: string): boolean {
  return (
    existsSync(join(checkout, 'plugin.json')) ||
    existsSync(join(checkout, '.claude-plugin', 'plugin.json'))
  );
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
