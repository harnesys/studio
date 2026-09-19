import { existsSync } from 'node:fs';
import type { PluginIr, PluginKind } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { CatalogEntry } from 'harnesys/plugins-catalog';
import type { PluginRepository } from '../../domain/plugin.port.ts';
export async function decorateCatalogEntries(
  entries: CatalogEntry[],
  plugins: PluginRepository,
): Promise<CatalogEntry[]> {
  return await Promise.all(entries.map((entry) => decorateEntry(entry, plugins)));
}
async function decorateEntry(
  entry: CatalogEntry,
  plugins: PluginRepository,
): Promise<CatalogEntry> {
  const record = plugins.findByNameAny(entry.pluginName);
  if (!record || !existsSync(record.path)) {
    return entry;
  }
  try {
    const loaded = await loadPluginIrFromDirectory({
      root: record.path,
      pluginData: record.dataPath,
    });
    const inertComponents = inertKinds(loaded.ir);
    return {
      ...entry,
      format: loaded.ir.sourceFormat,
      ...(inertComponents.length > 0 ? { inertComponents } : {}),
    };
  } catch {
    return { ...entry, format: record.format };
  }
}
function inertKinds(ir: PluginIr): PluginKind[] {
  const kinds = new Set<PluginKind>();
  for (const component of ir.components) {
    if (component.status === 'inert') {
      kinds.add(component.kind);
    }
  }
  return [...kinds];
}
