import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginLoadDiagnostic } from '@harnesys/studio-shared';
import { findMarketplaceManifest } from 'harnesys/plugins-catalog';

export type CatalogPluginMaterializeMeta = {
  name: string;
  description?: string;
  version?: string;
  /** True when marketplace entry declared lspServers (Harnesys does not run LSP yet). */
  hasLspServers: boolean;
};

/**
 * Claude `strict: false` entries (e.g. typescript-lsp) keep identity/components in
 * marketplace.json; the relative path may only contain LICENSE/README. Synthesize a
 * Claude-compat plugin.json so loadPluginFromDirectory accepts the checkout.
 */
export async function materializeCatalogPluginIfNeeded(
  checkout: string,
  meta: CatalogPluginMaterializeMeta,
): Promise<{ materialized: boolean; hasLspServers: boolean }> {
  if (hasRecognizedPluginLayout(checkout)) {
    return { materialized: false, hasLspServers: meta.hasLspServers };
  }
  const dir = join(checkout, '.claude-plugin');
  await mkdir(dir, { recursive: true });
  const manifest: Record<string, string> = { name: meta.name };
  if (meta.description) {
    manifest.description = meta.description;
  }
  if (meta.version) {
    manifest.version = meta.version;
  }
  await writeFile(join(dir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { materialized: true, hasLspServers: meta.hasLspServers };
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
  if (materialize.hasLspServers) {
    diagnostics.push({
      level: 'warning',
      code: 'lsp_not_supported',
      message: 'Marketplace entry declares lspServers; Harnesys does not run language servers yet.',
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
    return { name: pluginName, hasLspServers: false };
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(location.manifestPath, 'utf8'));
    if (!isRecord(raw) || !Array.isArray(raw.plugins)) {
      return { name: pluginName, hasLspServers: false };
    }
    for (const item of raw.plugins) {
      if (!isRecord(item)) {
        continue;
      }
      if (item.name !== pluginName) {
        continue;
      }
      const description = asString(item.description);
      const version = asString(item.version);
      return {
        name: pluginName,
        ...(description ? { description } : {}),
        ...(version ? { version } : {}),
        hasLspServers: isRecord(item.lspServers),
      };
    }
  } catch {
    // fall through
  }
  return { name: pluginName, hasLspServers: false };
}

function hasRecognizedPluginLayout(checkout: string): boolean {
  return (
    existsSync(join(checkout, 'plugin.json')) ||
    existsSync(join(checkout, '.claude-plugin', 'plugin.json'))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
